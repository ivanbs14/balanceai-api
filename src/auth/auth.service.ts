import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma-services/prisma.service";
import { Prisma } from "@prisma/client";
import {
  AUTH_USER_SELECT,
  AuthPayload,
  AuthUser,
  toAuthUser,
} from "./auth.types";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

export type GoogleUserProfile = {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
};

function getMissingEnvVarNames(varNames: string[]): string[] {
  return varNames.filter((varName) => !process.env[varName]);
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        googleSub: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException("E-mail ou senha incorretos");
    }

    const passwordMatch = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!passwordMatch) {
      throw new UnauthorizedException("E-mail ou senha incorretos");
    }

    return toAuthUser(user);
  }

  issueToken(user: AuthUser): string {
    const payload: AuthPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    return this.jwtService.sign(payload);
  }

  generateOauthState(): string {
    return randomBytes(24).toString("hex");
  }

  async issueGoogleLinkToken(userId: string, password: string, state: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!user?.password || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException("Senha atual incorreta.");
    }
    return this.jwtService.sign({ kind: "google-link", userId, state }, { expiresIn: "10m" });
  }

  verifyGoogleLinkToken(token: string, state: string): string {
    try {
      const claims = this.jwtService.verify<{ kind: string; userId: string; state: string }>(token);
      if (claims.kind !== "google-link" || claims.state !== state || !claims.userId) throw new Error();
      return claims.userId;
    } catch {
      throw new UnauthorizedException("Vínculo Google expirado ou inválido.");
    }
  }

  buildGoogleAuthorizationUrl(state: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      const missing = getMissingEnvVarNames([
        "GOOGLE_CLIENT_ID",
        "GOOGLE_REDIRECT_URI",
      ]);
      throw new UnauthorizedException(
        `Configuracao OAuth Google incompleta: ${missing.join(", ")}`,
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeGoogleCodeForAccessToken(code: string): Promise<string> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      const missing = getMissingEnvVarNames([
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "GOOGLE_REDIRECT_URI",
      ]);
      throw new UnauthorizedException(
        `Configuracao OAuth Google incompleta: ${missing.join(", ")}`,
      );
    }

    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json().catch(() => null)) as
      | GoogleTokenResponse
      | null;

    if (!response.ok || !data?.access_token) {
      throw new UnauthorizedException(
        "Nao foi possivel autenticar com Google",
      );
    }

    return data.access_token;
  }

  async fetchGoogleProfile(accessToken: string): Promise<GoogleUserProfile> {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    const profile = (await response.json().catch(() => null)) as
      | GoogleUserProfile
      | null;

    if (!response.ok || !profile?.email || !profile?.sub || profile.email_verified !== true) {
      throw new UnauthorizedException("Perfil Google invalido");
    }

    return profile;
  }

  async findOrCreateGoogleUser(profile: GoogleUserProfile): Promise<AuthUser> {
    if (!profile.email || !profile.sub || profile.email_verified !== true) {
      throw new UnauthorizedException("Perfil Google invalido");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { googleSub: profile.sub },
      select: AUTH_USER_SELECT,
    });

    if (existingUser) return toAuthUser(existingUser);

    if (await this.prisma.user.findUnique({ where: { email: profile.email }, select: { id: true } })) {
      throw new ConflictException("Entre com a conta local e vincule o Google explicitamente.");
    }

    const fallbackName = profile.name?.trim() || profile.email.split("@")[0];
    try {
      const createdUser = await this.prisma.user.create({
        data: { name: fallbackName, email: profile.email, googleSub: profile.sub, role: "user" },
        select: AUTH_USER_SELECT,
      });
      return toAuthUser(createdUser);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const sameSub = await this.prisma.user.findUnique({ where: { googleSub: profile.sub }, select: AUTH_USER_SELECT });
        if (sameSub) return toAuthUser(sameSub);
        throw new ConflictException("E-mail já pertence a outra conta.");
      }
      throw error;
    }
  }

  async linkGoogleUser(userId: string, profile: GoogleUserProfile): Promise<AuthUser> {
    if (!profile.sub || !profile.email || profile.email_verified !== true) throw new UnauthorizedException("Perfil Google inválido.");
    const existing = await this.prisma.user.findUnique({ where: { googleSub: profile.sub }, select: { id: true } });
    if (existing && existing.id !== userId) throw new ConflictException("Identidade Google já vinculada.");
    const target = await this.prisma.user.findUnique({ where: { id: userId }, select: { googleSub: true } });
    if (!target || (target.googleSub && target.googleSub !== profile.sub)) throw new ConflictException("Conta já vinculada a outra identidade Google.");
    try {
      const linkedUser = await this.prisma.user.update({ where: { id: userId }, data: { googleSub: profile.sub }, select: AUTH_USER_SELECT });
      return toAuthUser(linkedUser);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Identidade Google já vinculada.");
      throw error;
    }
  }
}
