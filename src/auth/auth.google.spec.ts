import { ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";

describe("Google identity policy", () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  } as any;
  const jwt = {
    sign: jest.fn(() => "link-token"),
    verify: jest.fn(() => ({ kind: "google-link", userId: "local-1", state: "nonce" })),
  } as any;
  const service = new AuthService(prisma, jwt);
  const profile = { sub: "google-sub", email: "person@example.test", email_verified: true };

  beforeEach(() => {
    jest.resetAllMocks();
    jwt.sign.mockReturnValue("link-token");
    jwt.verify.mockReturnValue({ kind: "google-link", userId: "local-1", state: "nonce" });
  });

  it("rejects absent verification and an existing local e-mail", async () => {
    await expect(service.findOrCreateGoogleUser({ ...profile, email_verified: undefined })).rejects.toBeInstanceOf(UnauthorizedException);
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "local-1" });
    await expect(service.findOrCreateGoogleUser(profile)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("resolves by stable sub after a Google e-mail change", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "google-1", name: "Person", email: "old@example.test", role: "user", googleSub: "google-sub" });
    await expect(service.findOrCreateGoogleUser({ ...profile, email: "new@example.test" })).resolves.toMatchObject({ id: "google-1", googleLinked: true });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("requires the local password again and matches the signed OAuth state", async () => {
    const hash = await bcrypt.hash("local-password", 4);
    prisma.user.findUnique.mockResolvedValue({ password: hash });
    await expect(service.issueGoogleLinkToken("local-1", "wrong", "nonce")).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.issueGoogleLinkToken("local-1", "local-password", "nonce")).resolves.toBe("link-token");
    expect(service.verifyGoogleLinkToken("link-token", "nonce")).toBe("local-1");
    expect(() => service.verifyGoogleLinkToken("link-token", "other-state")).toThrow(UnauthorizedException);
  });

  it("refuses a Google sub already owned by another account", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "other-user" });
    await expect(service.linkGoogleUser("local-1", profile)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
