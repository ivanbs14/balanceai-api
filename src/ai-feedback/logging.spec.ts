import { HttpException } from "@nestjs/common";
import { TransationType } from "@prisma/client";
import { PinoLogger } from "nestjs-pino";
import { AIFeedbackService } from "./ai-feedback.service";
import { GeminiService } from "./gemini.service";
import { PrismaService } from "../prisma-services/prisma.service";
import { TransationService } from "../transation/transation.service";

function fakeLogger() {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe("AI logging privacy", () => {
  it("emits named feedback events without account, period or financial values", async () => {
    const logger = fakeLogger();
    const prisma = {
      aIFeedback: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create: data }) => ({
          id: "private-feedback-id",
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      },
    };
    const transactions = {
      findAllTransactionsByUserIdAndMonth: jest.fn().mockResolvedValue([
        { type: TransationType.DEPOSIT, amount: 10000 },
        { type: TransationType.EXPENSE, amount: 2575, category: "FOOD" },
      ]),
    };
    const gemini = {
      generateFinancialAnalysis: jest
        .fn()
        .mockResolvedValue("private model response"),
      getModelName: jest.fn().mockReturnValue("test-model"),
    };
    const service = new AIFeedbackService(
      prisma as unknown as PrismaService,
      gemini as unknown as GeminiService,
      transactions as unknown as TransationService,
      logger as unknown as PinoLogger,
    );

    await service.generateFeedback("private-user-id", "2026-10");

    expect(prisma.aIFeedback.upsert).toHaveBeenCalledTimes(1);

    const events = logger.info.mock.calls.map(([fields]) => fields.event);
    expect(events).toEqual([
      "feedback_generation_started",
      "feedback_generation_succeeded",
    ]);
    expect(JSON.stringify(logger.info.mock.calls)).not.toMatch(
      /private-user-id|2026-10|10000|2575|private model response|private-feedback-id/,
    );
  });

  it("classifies provider rate limits without logging the external message or prompt", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "private-api-key";
    try {
      const logger = fakeLogger();
      const service = new GeminiService(logger as unknown as PinoLogger);
      (service as unknown as { genAI: unknown }).genAI = {
        models: {
          generateContent: async () => {
            throw new Error("429 private-provider-message quota retry in 1s");
          },
        },
      };

      await expect(
        service.generateFinancialAnalysis("private-financial-prompt"),
      ).rejects.toBeInstanceOf(HttpException);
      expect(logger.warn).toHaveBeenCalledWith({
        event: "gemini_request_failed",
        attempt: 1,
        errorCode: "PROVIDER_RATE_LIMIT",
      });
      expect(
        JSON.stringify([...logger.info.mock.calls, ...logger.warn.mock.calls]),
      ).not.toMatch(
        /private-api-key|private-provider-message|private-financial-prompt/,
      );
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  });

  it("keeps stored analysis when forced regeneration fails", async () => {
    const logger = fakeLogger();
    const prisma = {
      aIFeedback: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    const transactions = {
      findAllTransactionsByUserIdAndMonth: jest
        .fn()
        .mockResolvedValue([{ type: TransationType.DEPOSIT, amount: 100 }]),
    };
    const gemini = {
      generateFinancialAnalysis: jest
        .fn()
        .mockRejectedValue(new Error("provider unavailable")),
      getModelName: jest.fn().mockReturnValue("test-model"),
    };
    const service = new AIFeedbackService(
      prisma as unknown as PrismaService,
      gemini as unknown as GeminiService,
      transactions as unknown as TransationService,
      logger as unknown as PinoLogger,
    );

    await expect(
      service.generateFeedback("private-user-id", "2026-10", true),
    ).rejects.toThrow();
    expect(prisma.aIFeedback.upsert).not.toHaveBeenCalled();
    expect(prisma.aIFeedback.deleteMany).not.toHaveBeenCalled();
  });

  it("uses the configured Gemini model with a bounded request timeout", async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    const previousModel = process.env.GEMINI_MODEL;
    process.env.GEMINI_API_KEY = "private-api-key";
    process.env.GEMINI_MODEL = "test-model";
    try {
      const service = new GeminiService(fakeLogger() as unknown as PinoLogger);
      const generateContent = jest
        .fn()
        .mockResolvedValue({ text: " sample analysis " });
      (service as unknown as { genAI: unknown }).genAI = {
        models: { generateContent },
      };

      await expect(
        service.generateFinancialAnalysis("private-financial-prompt"),
      ).resolves.toBe("sample analysis");
      expect(generateContent).toHaveBeenCalledWith({
        model: "test-model",
        contents: "private-financial-prompt",
        config: { httpOptions: { timeout: expect.any(Number) } },
      });
      expect(
        generateContent.mock.calls[0][0].config.httpOptions.timeout,
      ).toBeLessThanOrEqual(10_000);
    } finally {
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
      if (previousModel === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = previousModel;
    }
  });
});
