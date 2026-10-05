import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { Response } from "express";

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const adapter = this.adapterHost.httpAdapter;
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorCode = "INTERNAL_ERROR";
    if (status === 400) errorCode = "VALIDATION_ERROR";
    else if (status === 401 || status === 403) errorCode = "AUTH_ERROR";
    else if (status === 404) errorCode = "NOT_FOUND";
    else if (status === 503) errorCode = "PROVIDER_UNAVAILABLE";
    else if (status < 500) errorCode = "CLIENT_ERROR";
    else if (this.isDatabaseError(exception)) errorCode = "DATABASE_ERROR";

    response.locals.logErrorCode = errorCode;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;
    const body =
      exception instanceof HttpException
        ? typeof exceptionResponse === "object"
          ? exceptionResponse
          : { statusCode: status, message: exceptionResponse }
        : { statusCode: status, message: "Internal server error" };
    if (adapter.isHeadersSent(response)) {
      adapter.end(response);
    } else {
      adapter.reply(response, body, status);
    }
  }

  private isDatabaseError(exception: unknown): boolean {
    if (!(exception instanceof Error)) return false;
    return (
      /^PrismaClient(KnownRequest|UnknownRequest|Initialization|Validation|RustPanic)Error$/.test(
        exception.name,
      ) ||
      ("code" in exception &&
        typeof exception.code === "string" &&
        /^P\d{4}$/.test(exception.code))
    );
  }
}
