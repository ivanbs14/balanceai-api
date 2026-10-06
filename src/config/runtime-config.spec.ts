import { validateRuntimeConfig } from "./runtime-config";

describe("runtime configuration", () => {
  const valid = {
    DATABASE_URL: "postgresql://test@localhost:5432/balance_test",
    JWT_SECRET: "only-for-tests-secret-with-32-chars",
    PORT: "4000",
    FRONTEND_URL: "http://localhost:3000",
  };

  it("fails before startup with only field names", () => {
    expect(() => validateRuntimeConfig({ DATABASE_URL: "secret" })).toThrow(
      "DATABASE_URL",
    );
    expect(() => validateRuntimeConfig({ DATABASE_URL: "secret" })).not.toThrow(
      "secret",
    );
    expect(() => validateRuntimeConfig({ ...valid, PORT: "99999" })).toThrow(
      "PORT",
    );
  });

  it("requires all OAuth fields when any one is configured", () => {
    expect(() =>
      validateRuntimeConfig({ ...valid, GOOGLE_CLIENT_ID: "id" }),
    ).toThrow("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI");
    expect(validateRuntimeConfig(valid).port).toBe(4000);
  });
});
