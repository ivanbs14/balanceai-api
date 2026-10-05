import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import { PinoLogger } from "nestjs-pino";

const GENERATION_TIMEOUT_MS = 10_000;

@Injectable()
export class GeminiService {
  private readonly genAI: GoogleGenAI;
  private readonly model: string;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(GeminiService.name);
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.genAI = new GoogleGenAI({ apiKey });
    this.model = process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash";
  }

  private isRateLimitError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : "";
    return /\b429\b|Too Many Requests|quota|rate limit/i.test(message);
  }

  private extractRetryDelay(error: unknown): number | null {
    const message = error instanceof Error ? error.message : "";
    const match = message.match(/retry in (\d+(?:\.\d+)?)s/i);
    return match ? Math.ceil(Number(match[1])) : null;
  }

  async generateFinancialAnalysis(prompt: string): Promise<string> {
    const deadline = Date.now() + GENERATION_TIMEOUT_MS;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;

      try {
        this.logger.info({ event: "gemini_request_started", attempt });
        const response = await this.genAI.models.generateContent({
          model: this.model,
          contents: prompt,
          config: { httpOptions: { timeout: remainingMs } },
        });
        const analysis = response.text?.trim();
        if (!analysis) throw new Error("Empty Gemini response");
        this.logger.info({ event: "gemini_request_succeeded", attempt });
        return analysis;
      } catch (error) {
        const rateLimited = this.isRateLimitError(error);
        this.logger.warn({
          event: "gemini_request_failed",
          attempt,
          errorCode: rateLimited ? "PROVIDER_RATE_LIMIT" : "PROVIDER_ERROR",
        });

        if (rateLimited) {
          throw new HttpException(
            {
              statusCode: HttpStatus.SERVICE_UNAVAILABLE,
              message:
                "Serviço de IA temporariamente indisponível por limite do provedor.",
              retryAfterSeconds: this.extractRetryDelay(error) ?? 30,
            },
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }

        if (attempt < 3) {
          const waitMs = Math.min(
            2 ** (attempt - 1) * 1000,
            deadline - Date.now(),
          );
          if (waitMs > 0) {
            this.logger.info({
              event: "gemini_request_retry_scheduled",
              attempt: attempt + 1,
              delayMs: waitMs,
            });
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          }
        }
      }
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: "Serviço de IA temporariamente indisponível.",
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  getModelName(): string {
    return this.model;
  }
}
