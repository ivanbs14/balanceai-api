import { ConflictException, INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JwtService } from "@nestjs/jwt";
import * as request from "supertest";
import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { UserService } from "../src/user/service";
import { RateLimitService } from "../src/security/rate-limit.service";

describe("Google OAuth callback contract (HTTP, fake provider)", () => {
  let app: INestApplication;
  const auth = {
    exchangeGoogleCodeForAccessToken: jest.fn(),
    fetchGoogleProfile: jest.fn(),
    findOrCreateGoogleUser: jest.fn(),
    verifyGoogleLinkToken: jest.fn(),
    linkGoogleUser: jest.fn(),
    issueToken: jest.fn(),
  };

  beforeAll(async () => {
    process.env.FRONTEND_URL = "http://localhost:3000";
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UserService, useValue: {} },
        { provide: RateLimitService, useValue: { checkOAuth: jest.fn() } },
        { provide: JwtService, useValue: { verify: jest.fn() } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    jest.resetAllMocks();
    auth.exchangeGoogleCodeForAccessToken.mockResolvedValue("fake-token");
    auth.fetchGoogleProfile.mockResolvedValue({ sub: "sub-1", email: "person@example.test", email_verified: true });
    auth.findOrCreateGoogleUser.mockResolvedValue({ id: "user-1", email: "person@example.test", role: "user" });
    auth.linkGoogleUser.mockResolvedValue({ id: "user-1", email: "person@example.test", role: "user" });
    auth.verifyGoogleLinkToken.mockReturnValue("user-1");
    auth.issueToken.mockReturnValue("session-token");
  });

  it("rejects absent or malformed state cookies before exchanging a code", async () => {
    await request(app.getHttpServer()).get("/auth/google/callback?code=fake&state=nonce").expect(302).expect("Location", "http://localhost:3000/?auth_error=google_state_invalid");
    await request(app.getHttpServer()).get("/auth/google/callback?code=fake&state=nonce").set("Cookie", "balance_google_oauth_state=%ZZ").expect(302).expect("Location", "http://localhost:3000/?auth_error=google_state_invalid");
    expect(auth.exchangeGoogleCodeForAccessToken).not.toHaveBeenCalled();
  });

  it("rejects an unverified profile and a local e-mail collision", async () => {
    auth.fetchGoogleProfile.mockResolvedValueOnce({ sub: "sub-1", email: "person@example.test" });
    await request(app.getHttpServer()).get("/auth/google/callback?code=fake&state=nonce").set("Cookie", "balance_google_oauth_state=nonce").expect(302).expect("Location", "http://localhost:3000/?auth_error=google_login_failed");
    expect(auth.findOrCreateGoogleUser).not.toHaveBeenCalled();
    auth.findOrCreateGoogleUser.mockRejectedValueOnce(new ConflictException());
    await request(app.getHttpServer()).get("/auth/google/callback?code=fake&state=nonce").set("Cookie", "balance_google_oauth_state=nonce").expect(302).expect("Location", "http://localhost:3000/?auth_error=google_link_required");
  });

  it("uses the signed link intent for an explicitly linked account", async () => {
    await request(app.getHttpServer()).get("/auth/google/callback?code=fake&state=nonce").set("Cookie", "balance_google_oauth_state=nonce; balance_google_link=fake-link-token").expect(302).expect("Location", "http://localhost:3000");
    expect(auth.verifyGoogleLinkToken).toHaveBeenCalledWith("fake-link-token", "nonce");
    expect(auth.linkGoogleUser).toHaveBeenCalledWith("user-1", expect.objectContaining({ sub: "sub-1" }));
    expect(auth.findOrCreateGoogleUser).not.toHaveBeenCalled();
  });
});
