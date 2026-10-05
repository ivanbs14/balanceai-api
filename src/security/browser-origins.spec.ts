import { getBrowserOrigins } from "./browser-origins";

describe("getBrowserOrigins", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("excludes development origins in production and includes configured exact origins", () => {
    process.env.NODE_ENV = "production";
    process.env.FRONTEND_URL = "https://app.example.com/dashboard";
    process.env.FRONTEND_URLS =
      "https://preview.example.com, javascript:invalid";

    const origins = getBrowserOrigins();
    expect(origins).toContain("https://app.example.com");
    expect(origins).toContain("https://preview.example.com");
    expect(origins).not.toContain("http://localhost:3000");
    expect(origins).not.toContain("javascript:invalid");
  });
});
