import { HttpException, HttpStatus } from "@nestjs/common";
import { RateLimitService } from "./rate-limit.service";

describe("RateLimitService", () => {
  let service: RateLimitService;

  beforeEach(() => {
    service = new RateLimitService();
  });

  afterEach(() => service.onModuleDestroy());

  it("limits login by normalized email even when the client IP changes", () => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      service.checkLogin(
        `192.0.2.${attempt}`,
        attempt % 2 ? "TEST@example.com" : "test@example.com",
      );
    }

    expect(() => service.checkLogin("192.0.2.200", "test@example.com")).toThrow(
      expect.objectContaining({ status: HttpStatus.TOO_MANY_REQUESTS }),
    );
    expect(() =>
      service.checkLogin("192.0.2.200", "another@example.com"),
    ).not.toThrow();
  });

  it("limits one IP even when login identifiers change", () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      service.checkLogin("192.0.2.1", `user${attempt}@example.com`);
    }
    expect(() => service.checkLogin("192.0.2.1", "other@example.com")).toThrow(
      HttpException,
    );
  });

  it("limits force regeneration by user and resets after the window", () => {
    const now = Date.now();
    const clock = jest.spyOn(Date, "now").mockReturnValue(now);
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        service.checkFeedback(`192.0.2.${attempt}`, "user-a", true);
      }
      expect(() =>
        service.checkFeedback("192.0.2.100", "user-a", true),
      ).toThrow(HttpException);
      service.checkFeedback("192.0.2.100", "user-b", true);
      clock.mockReturnValue(now + 60 * 60_000);
      expect(() =>
        service.checkFeedback("192.0.2.100", "user-a", true),
      ).not.toThrow();
    } finally {
      clock.mockRestore();
    }
  });
});
