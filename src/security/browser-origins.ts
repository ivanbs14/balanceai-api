const deployedOrigins = [
  "https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app",
  "https://balance-neon.vercel.app",
];

export function getBrowserOrigins() {
  const configured = [
    process.env.FRONTEND_URL,
    ...(process.env.FRONTEND_URLS?.split(",") ?? []),
  ];
  const defaultOrigins =
    process.env.NODE_ENV === "production"
      ? deployedOrigins
      : ["http://localhost:3000", "http://localhost:3001", ...deployedOrigins];

  return Array.from(
    new Set(
      [...defaultOrigins, ...configured]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => {
          try {
            const url = new URL(value);
            return url.protocol === "http:" || url.protocol === "https:"
              ? url.origin
              : null;
          } catch {
            return null;
          }
        })
        .filter((value): value is string => value !== null),
    ),
  );
}
