import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { AuthPayload } from "./auth.types";

const AUTH_COOKIE_NAME = "balance_auth";

function readCookieValue(cookieHeader: string | undefined, cookieName: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const cookiePair = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${cookieName}=`));

  if (!cookiePair) {
    return undefined;
  }

  return decodeURIComponent(cookiePair.slice(cookieName.length + 1));
}

@Injectable()
export class CookieAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<
      Request & { user?: AuthPayload }
    >();
    const token = readCookieValue(request.headers.cookie, AUTH_COOKIE_NAME);

    if (!token) {
      throw new UnauthorizedException("Sessao nao encontrada");
    }

    try {
      request.user = this.jwtService.verify<AuthPayload>(token);
      return true;
    } catch {
      throw new UnauthorizedException("Sessao invalida");
    }
  }
}

export { AUTH_COOKIE_NAME };
