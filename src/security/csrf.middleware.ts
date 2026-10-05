import { RequestHandler } from "express";
import { AUTH_COOKIE_NAME } from "../auth/cookie-auth.guard";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfOriginMiddleware(
  allowedOrigins: readonly string[],
): RequestHandler {
  const allowed = new Set(allowedOrigins);

  return (request, response, next) => {
    if (safeMethods.has(request.method)) return next();

    const origin = request.headers.origin;
    if (origin !== undefined) {
      if (allowed.has(origin)) return next();
      return response
        .status(403)
        .json({ statusCode: 403, message: "Origem não permitida." });
    }

    const referer = request.headers.referer;
    if (referer !== undefined) {
      try {
        if (allowed.has(new URL(referer).origin)) return next();
      } catch {
        // Invalid referers are rejected below.
      }
      return response
        .status(403)
        .json({ statusCode: 403, message: "Origem não permitida." });
    }

    const fetchSite = request.headers["sec-fetch-site"];
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      return response
        .status(403)
        .json({ statusCode: 403, message: "Origem não permitida." });
    }

    // A cookie-authenticated mutation without browser origin evidence cannot be
    // distinguished from a cross-site form request in older browsers.
    if (
      request.headers.cookie
        ?.split(";")
        .some((part) => part.trim().startsWith(`${AUTH_COOKIE_NAME}=`))
    ) {
      return response
        .status(403)
        .json({ statusCode: 403, message: "Origem não permitida." });
    }

    // Headerless clients without a session cookie may still use public routes.
    return next();
  };
}
