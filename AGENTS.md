# Repository Guidelines

## Project Structure & Module Organization
`src/` contains the NestJS application. Feature code is grouped by domain: `auth/`, `user/`, `card/`, and `transation/`, each with its module, controller, service, and DTOs. Shared database wiring lives in `src/prisma-services/`. Prisma schema and committed SQL migrations live under `prisma/`. End-to-end tests are in `test/`, and build output goes to `dist/` and should not be edited manually.

## Build, Test, and Development Commands
Install dependencies with `npm install`. Start local development with `npm run start:dev`; use `npm run start` for a single run and `npm run build` to compile to `dist/`. Run `npm run lint` to apply ESLint fixes and `npm run format` for Prettier formatting. Test with `npm run test`, `npm run test:e2e`, and `npm run test:cov`. For schema changes, use `npx prisma migrate dev --name <change>` and then `npx prisma generate`. If you are operating through the local Codex shell proxy, prefix commands with `rtk`, for example `rtk npm run test`.

## Coding Style & Naming Conventions
This repo uses TypeScript with NestJS conventions. Keep feature files inside their domain folder and use standard suffixes such as `*.module.ts`, `*.controller.ts`, `*.service.ts`, and `*.dto.ts`. Use PascalCase for classes and DTOs, camelCase for variables and methods, and 2-space indentation as formatted by Prettier. Follow the existing folder and route names; in particular, keep the current `transation` spelling unless you are doing an explicit repo-wide refactor.

## Testing Guidelines
Unit tests live next to source files as `*.spec.ts`; the current e2e suite lives in `test/app.e2e-spec.ts`. Add or update tests whenever controller, service, auth, or Prisma-backed behavior changes. Run `npm run test` before opening a PR and `npm run test:e2e` for route or module changes. Use `npm run test:cov` when touching core flows or persistence logic.

## Commit & Pull Request Guidelines
Recent history uses short Conventional Commit-style prefixes such as `feat:` and `refact:`. Keep commit messages imperative and scoped to one change, for example `feat: add card balance filter`. PRs should include a concise summary, affected modules, test results, and any Prisma migration or environment changes. Include request/response examples when changing API behavior.

## Security & Configuration Tips
Secrets belong in `.env`; never commit real credentials. `DATABASE_URL` is required for Prisma and local testing. When changing `prisma/schema.prisma`, commit the generated migration directory along with the code that depends on it.
