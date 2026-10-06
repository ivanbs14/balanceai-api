export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const missing: string[] = [];
  if (!env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL))
    missing.push("DATABASE_URL");
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32)
    missing.push("JWT_SECRET (mínimo 32 caracteres)");
  const port = Number(env.PORT ?? "4000");
  if (!Number.isInteger(port) || port < 1 || port > 65535) missing.push("PORT");
  const proxyHops = Number(env.TRUST_PROXY_HOPS ?? "0");
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 3)
    missing.push("TRUST_PROXY_HOPS");
  if (env.NODE_ENV === "production" && !env.FRONTEND_URL)
    missing.push("FRONTEND_URL");
  for (const value of [
    env.FRONTEND_URL,
    ...(env.FRONTEND_URLS?.split(",") ?? []),
  ]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim());
      if (
        !/^https?:$/.test(url.protocol) ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      missing.push("FRONTEND_URL/FRONTEND_URLS");
    }
  }
  const oauthNames = [
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "GOOGLE_REDIRECT_URI",
  ] as const;
  if (
    oauthNames.some((name) => Boolean(env[name])) &&
    oauthNames.some((name) => !env[name])
  ) {
    missing.push("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REDIRECT_URI");
  }
  if (missing.length)
    throw new Error(
      `Configuração de startup inválida: ${[...new Set(missing)].join(", ")}`,
    );
  return { port, proxyHops };
}
