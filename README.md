# Balance API

NestJS + Prisma API for the Balance application. The service handles users, cookie-based authentication, cards, transactions, and fixed costs on top of PostgreSQL.

## Stack

- NestJS 10
- Prisma
- PostgreSQL
- JWT authentication via HTTP-only cookie
- TypeScript

## Main Modules

- `auth`: email/password login, Google OAuth, current session, logout
- `user`: user CRUD
- `card`: card CRUD and card transaction lookups
- `transation`: transaction CRUD, monthly filters, card summaries
- `fixed-cost`: fixed cost CRUD and monthly status updates

## Requirements

- Node.js 18+ 
- npm
- PostgreSQL
- A `.env` file with the required variables

## Environment Variables

Create `.env` in the project root with at least:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
JWT_SECRET="replace-me"

# Optional but required if Google OAuth is enabled
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:4000/auth/google/callback"
FRONTEND_URL="http://localhost:3000"
FRONTEND_URLS=""
TRUST_PROXY_HOPS=0
GEMINI_API_KEY="replace-with-a-google-ai-studio-key"
GEMINI_MODEL="gemini-3.6-flash"

# Optional
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
```

Notes:

- `DATABASE_URL` is required by Prisma.
- `JWT_SECRET` is required by the `JwtModule`.
- `FRONTEND_URL` is used as the redirect target after Google login.
- `FRONTEND_URLS` can include extra origins (comma-separated) for CORS.
- `TRUST_PROXY_HOPS` controls how many trusted reverse proxy hops Express uses for client IPs; keep `0` when the API is exposed directly and set the actual hop count behind a trusted proxy.
- `GEMINI_API_KEY` is currently required at startup. `GEMINI_MODEL` defaults to `gemini-3.6-flash`; generation uses the current `@google/genai` SDK and has a 10-second total retry budget. A working provider call still needs validation with a configured key.
- Auth cookies are named `balance_auth`.
- `LOG_LEVEL` accepts `error`, `warn`, `info`, or `debug`; the default is `info` in every environment. Invalid values also fall back to `info`.

## Structured logs

The API writes one JSON object per line to stdout in development and production. It uses `nestjs-pino@4.4.1`, `pino@9.14.0`, and `pino-http@10.5.0` with NestJS 10. Every event has an ISO `time`, string `level`, `event`, and `context`. Request events also have a generated UUID `requestId`; client supplied IDs are ignored.

Each HTTP response emits one `http_request_completed` event with `method`, the route pattern in `path` (or `<unmatched>`), `statusCode`, and nonnegative `durationMs`. Responses 4xx use `warn`; 5xx use `error`; successful responses use `info`. HTTP completions and `server_started` are emitted at every configured level. Other events follow the `LOG_LEVEL` threshold: `debug` includes all events, `info` suppresses debug, `warn` suppresses info and debug, and `error` includes only errors.

Example with fictitious values:

```json
{"time":"2026-10-05T12:00:00.000Z","level":"info","requestId":"8f2c0000-0000-4000-8000-000000000000","event":"http_request_completed","context":"HTTP","method":"GET","path":"/auth/me","statusCode":200,"durationMs":18}
```

To find all events for a request, copy its `requestId` from the completion event and filter collected stdout lines, for example: `jq -c 'select(.requestId == "8f2c0000-0000-4000-8000-000000000000")' api.log`. `event` can also filter feedback and Gemini events such as `feedback_cache_hit`, `feedback_generation_succeeded`, and `gemini_request_failed`.

HTTP serialization permits only `requestId`, `method`, route pattern `path`, `statusCode`, `durationMs`, and a fixed `errorCode` for failures. Service events permit `event`, `context`, `requestId`, `attempt`, `delayMs`, `forceRegenerate`, and fixed `errorCode`; the bootstrap event also has `port`. The logger drops unlisted object fields. Headers, cookies, Authorization, query values, bodies, prompts, model responses, financial values, user IDs, email, document, and raw external error messages are not logged. Prisma query logging remains disabled. The known `getMonthlyTransactions` read failure still returns an empty list; it emits `feedback_transactions_read_failed` and is tracked separately under TECH-004.

## Installation

```bash
npm install
```

If you are running through the local Codex shell proxy, use:

```bash
rtk npm install
```

## Database Setup

Apply migrations and generate the Prisma client:

```bash
npx prisma migrate dev
npx prisma generate
```

Seed categories and sample cards:

```bash
npm run db:seed
```

The seed creates:

- default categories
- a sample user: `seed@balance.local`
- sample cards for that user

## Running the API

```bash
# development with watch mode
npm run start:dev

# single run
npm run start

# production build
npm run build
npm run start:prod
```

By default the API listens on `http://localhost:4000`.

The compiled entrypoint is emitted at `dist/src/main.js`.

## Docker

This repository now includes a Docker image definition for local development and production-style builds.

Build the API image directly:

```bash
docker build -t balance-api-dev ./balance-api
```

Run the development container through the workspace compose file:

```bash
docker compose up --build api
```

Build only the API service from compose:

```bash
docker compose build api
```

Notes:

- The container expects a valid `balance-api/.env`.
- `DATABASE_URL` should keep pointing to the cloud PostgreSQL instance.
- The image includes `openssl` because Prisma depends on it at runtime.
- The API remains exposed on `http://localhost:4000`.

## Render Deployment

The production build uses `tsc` directly, so it does not depend on the Nest CLI binary being present in the build environment.

Recommended Render settings:

```bash
# Build Command
npm ci && npm run build

# Start Command
npm run start:deploy
```

Keep `NODE_ENV=production` in runtime.

The deploy start command runs `prisma migrate deploy` before booting the API, so
the runtime database stays aligned with committed Prisma migrations.

## Browser origin checks and request limits

Credentialed browser requests allow these frontend origins in production:

- `https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app`
- `https://balance-neon.vercel.app`

Development also allows `http://localhost:3000` and `http://localhost:3001`. Origins from `FRONTEND_URL` and `FRONTEND_URLS` (comma-separated) are allowed in both environments. The API rejects unsafe requests with an unrecognized `Origin` or `Referer`, or cross-site Fetch Metadata. Cookie-authenticated mutations without origin evidence also receive 403; API clients using the session cookie should send an allowed `Origin` header. OAuth callback uses GET with a state cookie and is unaffected.

Login is limited to 30 attempts per IP and 8 per normalized email in 15 minutes; registration to 6 per IP per hour; OAuth start and callback to 15 per IP in 15 minutes; AI generation to 30 per IP and 8 per user per hour, with 3 forced regenerations per user per hour. Excess attempts return 429. Set `TRUST_PROXY_HOPS` to the deployment's real proxy count for accurate per-IP limits. The counters live in each API process and reset on restart; a deployment with multiple replicas needs a shared limiter to enforce the same limits globally. The API accepts at most 24 installments on creation and group edits.

## Available Scripts

```bash
npm run build
npm run format
npm run lint
npm run test
npm run test:e2e
npm run test:cov
npm run db:seed
npm run db:import:bkpcsv
npm run db:import:bkpcsv:dry
npm run db:import:bkpcsv:repair-fixed
```

## Prisma Workflow

When the schema changes:

```bash
npx prisma migrate dev --name describe_change
npx prisma generate
```

Committed migrations live in [`prisma/migrations`](./prisma/migrations).

## CSV Import

The repository includes a CSV importer at [`prisma/import-bkpcsv.ts`](./prisma/import-bkpcsv.ts).

Examples:

```bash
# validate import without writing to the database
npm run db:import:bkpcsv:dry

# execute import
npm run db:import:bkpcsv

# repair older imported transactions missing isFixed
npm run db:import:bkpcsv:repair-fixed

# target a specific user by email
npm run db:import:bkpcsv -- --user-email=seed@balance.local

# import a single year
npm run db:import:bkpcsv -- --year=2026

# custom CSV directory
npm run db:import:bkpcsv -- --path=../dados/bkpcsv
```

## API Summary

This is a route-level overview based on the current controllers.

### Auth

- `POST /auth`
- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/me`
- `POST /auth/logout`

### Users

- `POST /user`
- `GET /user`
- `GET /user/:id`
- `PUT /user/:id`
- `DELETE /user/:id`

### Cards

- `POST /cards`
- `GET /cards`
- `GET /cards/:userId`
- `GET /cards/transation/:cardId?date=YYYY-MM-DD&page=1&pageSize=10`
- `GET /cards/transations/:id`
- `PATCH /cards/:id`
- `DELETE /cards/:id`

### Transations

- `POST /transations`
- `GET /transations`
- `GET /transations/previous-date/:userId/:date`
- `GET /transations/user/:userId/:month?page=1&pageSize=10`
- `GET /transations/card/:userId/:date`
- `GET /transations/card-names/:userId`
- `GET /transations/find-card/:nameCard`
- `GET /transations/open-by-card/:nameCard` (somente despesas pendentes do cartão da sessão)
- `GET /transations/:id`
- `PUT /transations/:id`
- `DELETE /transations/:id`

### Fixed Costs

- `POST /fixed-costs`
- `GET /fixed-costs`
- `GET /fixed-costs?userId=<id>`
- `GET /fixed-costs?userId=<id>&month=YYYY-MM`
- `GET /fixed-costs/:id`
- `PATCH /fixed-costs/:id`
- `PATCH /fixed-costs/:id/monthly/:competence`
- `DELETE /fixed-costs/:id`

## Tests

```bash
npm run test
npm run test:e2e
npm run test:cov
```

## Project References

- Product documentation: https://docs.google.com/document/d/17rePauq0_ZV_9Q0b4VyD2bokxDuFkM01_2yfYdHfq94/edit?tab=t.0#heading=h.sz7lo2na1m5b
- Heroku deployment notes: https://docs.google.com/document/d/19CIUUAZKRo5f1jjcauN3FW-675eV44UdtVbwlP_uDok/edit?tab=t.0
