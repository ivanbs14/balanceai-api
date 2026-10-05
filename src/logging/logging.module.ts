import { randomUUID } from "crypto";
import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { Request, Response } from "express";

type LoggedRequest = Request & { id?: string };
type LoggedResponse = Response & { locals: { logErrorCode?: string } };

const configuredLevel = process.env.LOG_LEVEL?.toLowerCase();
const level = ["error", "warn", "info", "debug"].includes(configuredLevel ?? "")
  ? configuredLevel
  : "info";
const minimumLevel = { debug: 20, info: 30, warn: 40, error: 50 }[level];
const allowedFields = [
  "event",
  "context",
  "method",
  "path",
  "statusCode",
  "durationMs",
  "errorCode",
  "attempt",
  "delayMs",
  "forceRegenerate",
  "port",
] as const;

function safeLogFields(fields: Record<string, unknown>) {
  const safe: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (fields[key] !== undefined) safe[key] = fields[key];
  }
  safe.context ??= "Application";
  if (fields.err && !safe.event) {
    safe.event = "operational_error";
    safe.errorCode = "INTERNAL_ERROR";
  }
  return safe;
}

function safeRoute(req: LoggedRequest): string {
  const route = req.route?.path;
  return typeof route === "string" && /^\/[a-zA-Z0-9_:/.-]*$/.test(route)
    ? route
    : "<unmatched>";
}

function completedRequest(
  req: LoggedRequest,
  res: LoggedResponse,
  durationMs: number,
) {
  return {
    context: "HTTP",
    method: req.method,
    path: safeRoute(req),
    statusCode: res.statusCode,
    durationMs: Math.max(0, durationMs),
    ...(res.locals?.logErrorCode ? { errorCode: res.locals.logErrorCode } : {}),
  };
}

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: "debug",
        hooks: {
          logMethod(args, method, eventLevel) {
            const fields = args[0];
            const alwaysLog =
              typeof fields === "object" &&
              fields !== null &&
              (("context" in fields && fields.context === "HTTP") ||
                ("event" in fields && fields.event === "server_started"));
            if (alwaysLog || eventLevel >= minimumLevel) {
              method.apply(this, args);
            }
          },
        },
        timestamp: () => `,"time":"${new Date().toISOString()}"`,
        formatters: {
          level: (label) => ({ level: label }),
          bindings: () => ({}),
          log: safeLogFields,
        },
        messageKey: "event",
        genReqId: () => randomUUID(),
        customAttributeKeys: { reqId: "requestId" },
        quietReqLogger: true,
        quietResLogger: true,
        customLogLevel: (_req, res) =>
          res.statusCode >= 500
            ? "error"
            : res.statusCode >= 400
              ? "warn"
              : "info",
        customSuccessObject: (req, res, value) =>
          completedRequest(
            req as LoggedRequest,
            res as LoggedResponse,
            value.responseTime,
          ),
        customErrorObject: (req, res, _error, value) =>
          completedRequest(
            req as LoggedRequest,
            res as LoggedResponse,
            value.responseTime,
          ),
        customSuccessMessage: () => "http_request_completed",
        customErrorMessage: () => "http_request_completed",
        serializers: {
          req: () => undefined,
          res: () => undefined,
          err: () => undefined,
        },
      },
    }),
  ],
  exports: [LoggerModule],
})
export class LoggingModule {}
