import { Injectable, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "src/prisma-services/prisma.service";
import { AuthPayload, AuthUser } from "./auth.types";

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserProfile = {
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
      },
    });

    if (!user) {
      throw new UnauthorizedException("E-mail ou senha incorretos");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException("E-mail ou senha incorretos");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
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
    });

    const data = (await response.json().catch(() => null)) as
      | GoogleTokenResponse
      | null;

    if (!response.ok || !data?.access_token) {
      throw new UnauthorizedException(
        data?.error_description ?? "Nao foi possivel autenticar com Google",
      );
    }

    return data.access_token;
  }

  async fetchGoogleProfile(accessToken: string): Promise<GoogleUserProfile> {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const profile = (await response.json().catch(() => null)) as
      | GoogleUserProfile
      | null;

    if (!response.ok || !profile?.email || !profile?.sub) {
      throw new UnauthorizedException("Perfil Google invalido");
    }

    return profile;
  }

  async findOrCreateGoogleUser(profile: GoogleUserProfile): Promise<AuthUser> {
    if (!profile.email || !profile.sub) {
      throw new UnauthorizedException("Perfil Google invalido");
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (existingUser) {
      return existingUser;
    }

    const fallbackName = profile.name?.trim() || profile.email.split("@")[0];
    const randomPassword = randomBytes(32).toString("hex");
    const hashedPassword = await bcrypt.hash(randomPassword, 10);
    const generatedDocument = `google-${profile.sub}`;

    const createdUser = await this.prisma.user.create({
      data: {
        name: fallbackName,
        document: generatedDocument,
        email: profile.email,
        password: hashedPassword,
        role: "user",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return createdUser;
  }
}
