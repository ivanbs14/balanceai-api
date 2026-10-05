import { NextFunction, Request, Response } from "express";
import { csrfOriginMiddleware } from "./csrf.middleware";

describe("csrfOriginMiddleware", () => {
  const middleware = csrfOriginMiddleware([
    "http://localhost:3000",
    "https://balance.example",
  ]);

  function check(method: string, headers: Record<string, string>) {
    const request = { method, headers } as unknown as Request;
    const result = { status: 200, allowed: false };
    const response = {
      status: (status: number) => {
        result.status = status;
        return response;
      },
      json: () => response,
    } as unknown as Response;
    const next = (() => {
      result.allowed = true;
    }) as NextFunction;
    middleware(request, response, next);
    return result;
  }

  it("allows a configured cross-origin frontend and safe reads", () => {
    expect(
      check("POST", {
        origin: "https://balance.example",
        "sec-fetch-site": "cross-site",
      }),
    ).toEqual({
      status: 200,
      allowed: true,
    });
    expect(check("GET", { origin: "https://attacker.example" }).allowed).toBe(
      true,
    );
  });

  it("rejects malicious and opaque origins without prefix matching", () => {
    for (const origin of [
      "https://balance.example.evil.test",
      "null",
      "https://attacker.example",
    ]) {
      expect(check("POST", { origin }).status).toBe(403);
    }
  });

  it("validates Referer when Origin is absent and rejects cross-site fetch metadata", () => {
    expect(
      check("PATCH", { referer: "https://balance.example/dashboard" }).allowed,
    ).toBe(true);
    expect(
      check("PATCH", { referer: "https://balance.example.evil.test/" }).status,
    ).toBe(403);
    expect(check("DELETE", { "sec-fetch-site": "cross-site" }).status).toBe(
      403,
    );
    expect(check("DELETE", { "sec-fetch-site": "same-site" }).status).toBe(403);
    expect(check("DELETE", { "sec-fetch-site": "same-origin" }).allowed).toBe(
      true,
    );
  });

  it("keeps non-browser API clients without browser origin headers working", () => {
    expect(check("POST", {}).allowed).toBe(true);
  });

  it("rejects a session mutation when all origin evidence is absent", () => {
    expect(check("POST", { cookie: "balance_auth=token" }).status).toBe(403);
    expect(
      check("POST", { cookie: "other=value; balance_auth=token" }).status,
    ).toBe(403);
    expect(
      check("POST", {
        cookie: "balance_auth=token",
        origin: "https://balance.example",
      }).allowed,
    ).toBe(true);
  });
});
