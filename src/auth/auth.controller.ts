import {
  Body,
  Controller,
  Get,
  Req,
  Query,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { CookieAuthGuard, AUTH_COOKIE_NAME } from "./cookie-auth.guard";
import { CurrentUser } from "./current-user.decorator";
import { AuthPayload } from "./auth.types";
import { UserService } from "src/user/service";

const GOOGLE_OAUTH_STATE_COOKIE = "balance_google_oauth_state";

function getCookieSameSite() {
  return process.env.NODE_ENV === "production" ? "None" : "Lax";
}

function shouldUseSecureCookie() {
  return process.env.NODE_ENV === "production";
}

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

function buildAuthCookie(token: string) {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${getCookieSameSite()}`,
    "Max-Age=3600",
  ];

  if (shouldUseSecureCookie()) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

function buildExpiredAuthCookie() {
  const cookieParts = [
    `${AUTH_COOKIE_NAME}=`,
    "HttpOnly",
    "Path=/",
    `SameSite=${getCookieSameSite()}`,
    "Max-Age=0",
  ];

  if (shouldUseSecureCookie()) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

function buildOauthStateCookie(state: string) {
  const cookieParts = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}`,
    "HttpOnly",
    "Path=/",
    `SameSite=${getCookieSameSite()}`,
    "Max-Age=600",
  ];

  if (shouldUseSecureCookie()) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

function buildExpiredOauthStateCookie() {
  const cookieParts = [
    `${GOOGLE_OAUTH_STATE_COOKIE}=`,
    "HttpOnly",
    "Path=/",
    `SameSite=${getCookieSameSite()}`,
    "Max-Age=0",
  ];

  if (shouldUseSecureCookie()) {
    cookieParts.push("Secure");
  }

  return cookieParts.join("; ");
}

function getFrontendBaseUrl() {
  return process.env.FRONTEND_URL ?? "http://localhost:3000";
}

function buildFrontendErrorUrl(errorCode: string) {
  const url = new URL(getFrontendBaseUrl());
  url.searchParams.set("auth_error", errorCode);
  return url.toString();
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  @Post()
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateUser(
      loginDto.email,
      loginDto.password,
    );
    const token = this.authService.issueToken(user);

    res.setHeader("Set-Cookie", buildAuthCookie(token));

    return {
      user,
    };
  }

  @Get("google")
  googleLogin(@Res() res: Response) {
    const state = this.authService.generateOauthState();
    const authorizationUrl = this.authService.buildGoogleAuthorizationUrl(state);

    res.setHeader("Set-Cookie", buildOauthStateCookie(state));
    return res.redirect(authorizationUrl);
  }

  @Get("google/callback")
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const expectedState = readCookieValue(
      request.headers.cookie,
      GOOGLE_OAUTH_STATE_COOKIE,
    );

    if (!code || !state || !expectedState || state !== expectedState) {
      res.setHeader("Set-Cookie", buildExpiredOauthStateCookie());
      return res.redirect(buildFrontendErrorUrl("google_state_invalid"));
    }

    try {
      const accessToken = await this.authService.exchangeGoogleCodeForAccessToken(
        code,
      );
      const profile = await this.authService.fetchGoogleProfile(accessToken);

      if (profile.email_verified === false) {
        throw new UnauthorizedException("Conta Google sem e-mail verificado");
      }

      const user = await this.authService.findOrCreateGoogleUser(profile);
      const token = this.authService.issueToken(user);

      res.setHeader("Set-Cookie", [
        buildAuthCookie(token),
        buildExpiredOauthStateCookie(),
      ]);

      return res.redirect(getFrontendBaseUrl());
    } catch {
      res.setHeader("Set-Cookie", buildExpiredOauthStateCookie());
      return res.redirect(buildFrontendErrorUrl("google_login_failed"));
    }
  }

  @UseGuards(CookieAuthGuard)
  @Get("me")
  async me(@CurrentUser() user: AuthPayload) {
    return {
      user: await this.userService.getAuthUserById(user.userId),
    };
  }

  @Post("logout")
  async logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Set-Cookie", buildExpiredAuthCookie());

    return {
      success: true,
    };
  }
}
