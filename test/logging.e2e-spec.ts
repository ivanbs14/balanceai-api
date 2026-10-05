import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Module,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { Logger, PinoLogger } from "nestjs-pino";
import { Request } from "express";
import * as request from "supertest";
import { LoggingModule } from "../src/logging/logging.module";
import { SafeExceptionFilter } from "../src/logging/safe-exception.filter";

@Controller()
class LoggingTestController {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LoggingTestController.name);
  }

  @Post("auth")
  login() {
    this.logger.info({
      event: "login_test_started",
      password: "accidental-secret",
    });
    this.logger.debug({ event: "login_debug_detail" });
    this.logger.info({ event: "login_test_succeeded" });
    return { ok: true };
  }

  @Get("ai-feedback/generate/:month")
  feedback(@Param("month") _month: string, @Req() req: Request) {
    this.logger.warn({
      event: "gemini_request_failed",
      attempt: 1,
      errorCode: "PROVIDER_ERROR",
    });
    if (req.query.fail === "true")
      throw new Error("sensitive provider response");
    if (req.query.fail === "database") {
      const error = new Error("private database message");
      error.name = "PrismaClientInitializationError";
      throw error;
    }
    if (req.query.fail === "provider")
      throw new HttpException(
        "private provider message",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    throw new HttpException("No feedback", HttpStatus.BAD_REQUEST);
  }
}

@Module({ imports: [LoggingModule], controllers: [LoggingTestController] })
class LoggingTestModule {}

describe("structured logging (e2e)", () => {
  it("correlates requests and excludes credentials, query values and financial data", async () => {
    const lines: string[] = [];
    const spy = jest.spyOn(process.stdout, "write").mockImplementation(((
      chunk: string | Uint8Array,
    ) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
    const module = await Test.createTestingModule({
      imports: [LoggingTestModule],
    }).compile();
    const app = module.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.useGlobalFilters(new SafeExceptionFilter(app.get(HttpAdapterHost)));

    try {
      await app.init();
      app.get(Logger).log({ event: "server_started", port: 4000 }, "Bootstrap");
      await request(app.getHttpServer())
        .post("/auth?token=query-secret")
        .set("Cookie", "balance_auth=cookie-secret")
        .set("Authorization", "Bearer header-secret")
        .set("X-Request-Id", "client-controlled-id")
        .send({
          email: "private@example.test",
          password: "password-secret",
          amount: 12345,
        })
        .expect(201);
      await request(app.getHttpServer())
        .get("/ai-feedback/generate/2026-10?prompt=private-prompt")
        .expect(400);
      await request(app.getHttpServer())
        .get("/ai-feedback/generate/2026-10?fail=true")
        .expect(500);
      await request(app.getHttpServer())
        .get("/ai-feedback/generate/2026-10?fail=database")
        .expect(500);
      await request(app.getHttpServer())
        .get("/ai-feedback/generate/2026-10?fail=provider")
        .expect(503);
      await request(app.getHttpServer())
        .get("/missing/private-path?token=missing-query-secret")
        .expect(404);
    } finally {
      await app.close();
      spy.mockRestore();
    }

    const output = lines.join("");
    expect(output).not.toMatch(
      /query-secret|cookie-secret|header-secret|client-controlled-id|private@example\.test|password-secret|accidental-secret|12345|private-prompt|private-path|missing-query-secret|sensitive provider response|private database message|private provider message/,
    );
    const events = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    for (const line of output.trim().split("\n")) {
      expect(line.match(/"requestId":/g)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(line.match(/"event":/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
    const completed = events.filter(
      (entry) => entry.event === "http_request_completed",
    );
    expect(events.some((entry) => entry.event === "server_started")).toBe(true);
    expect(completed).toHaveLength(6);
    expect(completed.map((entry) => entry.statusCode)).toEqual([
      201, 400, 500, 500, 503, 404,
    ]);
    expect(completed.map((entry) => entry.path)).toEqual([
      "/auth",
      "/ai-feedback/generate/:month",
      "/ai-feedback/generate/:month",
      "/ai-feedback/generate/:month",
      "/ai-feedback/generate/:month",
      "<unmatched>",
    ]);
    expect(new Set(completed.map((entry) => entry.requestId)).size).toBe(6);
    for (const entry of events) {
      expect(typeof entry.time).toBe("string");
      expect(typeof entry.level).toBe("string");
      expect(entry.event).toBeDefined();
    }
    for (const entry of completed) {
      expect(entry.durationMs).toBeGreaterThanOrEqual(0);
      expect(entry.context).toBe("HTTP");
    }
    expect(completed.map((entry) => entry.level)).toEqual([
      "info",
      "warn",
      "error",
      "error",
      "error",
      "warn",
    ]);
    const serviceEvents = events.filter((entry) =>
      entry.event?.startsWith("login_test_"),
    );
    expect(serviceEvents).toHaveLength(
      ["warn", "error"].includes(process.env.LOG_LEVEL ?? "") ? 0 : 2,
    );
    expect(
      serviceEvents.every(
        (entry) => entry.requestId === completed[0].requestId,
      ),
    ).toBe(true);
    expect(
      events.find((entry) => entry.event === "gemini_request_failed")
        ?.requestId,
    ).toBe(
      process.env.LOG_LEVEL === "error" ? undefined : completed[1].requestId,
    );
    expect(events.some((entry) => entry.event === "login_debug_detail")).toBe(
      process.env.LOG_LEVEL === "debug",
    );
    expect(completed[1].errorCode).toBe("VALIDATION_ERROR");
    expect(completed[2].errorCode).toBe("INTERNAL_ERROR");
    expect(completed[3].errorCode).toBe("DATABASE_ERROR");
    expect(completed[4].errorCode).toBe("PROVIDER_UNAVAILABLE");
    expect(completed[5].errorCode).toBe("NOT_FOUND");
  });
});
