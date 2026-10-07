# Balance API

> Estado em 06/10/2026: a API e o web receberam os contratos financeiros, de datas, integridade e OAuth descritos abaixo. A frente de IA está pausada; referências históricas a ela neste arquivo não são instruções de ativação nem critérios de validação atual.

NestJS + Prisma API for the Balance application. The service handles users, cookie-based authentication, cards, transactions, and fixed costs on top of PostgreSQL.

## Commit messages

Write every commit subject and suggested commit subject in English. Example: `feat(api): implement TECH-004 financial and authentication changes`.

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

- Node.js 20+
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
GEMINI_API_KEY=""
GEMINI_MODEL="gemini-3.6-flash"

# Optional
PORT=4000
NODE_ENV=development
LOG_LEVEL=info
```

Notes:

- `DATABASE_URL` is required by Prisma.
- `JWT_SECRET` must contain at least 32 characters.
- `FRONTEND_URL` is used as the redirect target after Google login.
- `FRONTEND_URLS` can include extra origins (comma-separated) for CORS.
- `TRUST_PROXY_HOPS` controls how many trusted reverse proxy hops Express uses for client IPs; keep `0` when the API is exposed directly and set the actual hop count behind a trusted proxy.
- A frente de IA está pausada. `GEMINI_API_KEY` e `GEMINI_MODEL` permanecem apenas por compatibilidade histórica; não são requisitos do fluxo ativo.
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

HTTP serialization permits only `requestId`, `method`, route pattern `path`, `statusCode`, `durationMs`, and a fixed `errorCode` for failures. Service events permit `event`, `context`, `requestId`, `attempt`, `delayMs`, `forceRegenerate`, and fixed `errorCode`; the bootstrap event also has `port`. The logger drops unlisted object fields. Headers, cookies, Authorization, query values, bodies, prompts, model responses, financial values, user IDs, email, document, and raw external error messages are not logged. Prisma query logging remains disabled. A financial-summary read failure during AI generation returns a controlled 503 and emits `feedback_summary_read_failed`.

## Financial summary

`totalValues.totalExpenses` and `realizedExpenses` include paid expense transactions and paid fixed-cost monthlies **without a linked transaction**. `forecastExpenses` includes pending expense transactions and unlinked pending fixed-cost monthlies, including recurring projections. `balance` is available cash after deposits, investment contributions, paid expenses withdrawn from cash, and paid unlinked fixed costs. `investedPosition` is contributions less paid expenses withdrawn from investments. `projectedBalance` also subtracts pending cash expenses and unlinked fixed-cost forecasts. `totalInvestments` remains as a compatibility alias for invested position. The web shows paid expenses, forecast expenses, available cash, and invested position separately.

Editing an installment group changes only pending parcels. The group-summary endpoint returns the pending amount, start date and count plus `paidInstallments`; a fully paid group returns 409. For a mixed group, edit `amount` and `installments` refer to the pending portion, and paid rows retain their historical fields. A group with any parcel linked to a fixed-cost monthly must be unlinked before editing. Historical transaction and fixed-cost monthly records remain independent until linked explicitly; identical names or amounts are never treated automatically as one payment.

The read-only inventory query at [`prisma/audits/fixed-cost-overlap.sql`](./prisma/audits/fixed-cost-overlap.sql) lists possible overlaps between expense transactions and persisted or projected fixed-cost monthlies for an explicitly selected month range. It matches the same owner, month, and category when either the amount or normalized name matches, so recurring amounts may vary. It only identifies candidates; each pair requires review before any data repair. Run it with `psql -v from_month=YYYY-MM -v to_month=YYYY-MM` against an authorized database.

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
- `DATABASE_URL` deve apontar para uma base local isolada durante desenvolvimento e testes. Nunca reutilize a URL de produção para testes, importação ou reparos.
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

`start:deploy` inicia apenas a API. Execute `prisma migrate deploy` em um job separado, uma vez por implantação, após auditar e preparar os dados existentes. O estágio Docker `migrate` inclui a CLI do Prisma; as réplicas do estágio `production` apenas iniciam a aplicação.

## Browser origin checks and request limits

Credentialed browser requests allow these frontend origins in production:

- `https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app`
- `https://balance-neon.vercel.app`

Development also allows `http://localhost:3000` and `http://localhost:3001`. Origins from `FRONTEND_URL` and `FRONTEND_URLS` (comma-separated) are allowed in both environments. The API rejects unsafe requests with an unrecognized `Origin` or `Referer`, or cross-site Fetch Metadata. Cookie-authenticated mutations without origin evidence also receive 403; API clients using the session cookie should send an allowed `Origin` header. OAuth callback uses GET with a state cookie and is unaffected.

Login is limited to 30 attempts per IP and 8 per normalized email in 15 minutes; registration to 6 per IP per hour; OAuth start and callback to 15 per IP in 15 minutes; AI generation to 30 per IP and 8 per user per hour, with 3 forced regenerations per user per hour. Excess attempts return 429. Set `TRUST_PROXY_HOPS` to the deployment's real proxy count for accurate per-IP limits. The counters live in each API process and reset on restart; a deployment with multiple replicas needs a shared limiter to enforce the same limits globally. The API accepts at most 24 installments on creation and group edits.

Em 07/10/2026, o operador confirmou que a configuração do ambiente de produção foi concluída, incluindo a topologia operacional necessária para proxy, réplicas, cookies/origens e migrations separadas do startup. Valores, segredos, URLs, provedor e quantidade de réplicas não são registrados neste README. A confirmação de configuração não substitui o QA funcional de CSRF e limites de requisição no ambiente.

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
- `POST /auth/google/link` (sessão local e senha atual)
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
- `POST /fixed-costs/:id/monthly/:competence/link`
- `DELETE /fixed-costs/:id/monthly/:competence/link`
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

## Contrato ativo da TECH-004 (06/10/2026)

Datas de domínio usam `YYYY-MM-DD` como **dia civil**. A API armazena esse dia à meia-noite UTC e aplica intervalos `[início do mês, início do mês seguinte)`; a competência é `YYYY-MM`. `paidAt` é um instante e pode cair após a competência. Uma recorrência com vencimento 29, 30 ou 31 vence no último dia dos meses mais curtos. Datas impossíveis e meses 00/13 geram 400.

Os valores monetários enviados em JSON são strings decimais positivas com duas casas, como `"100.00"`. `POST /transations`, `POST /fixed-costs` e alterações usam o usuário do cookie; `userId` legado só é aceito se for igual ao da sessão. Rotas legadas `/transations/.../:userId/...` permanecem, mas rejeitam outro titular com 403. A listagem mensal aceita `page` positivo e `pageSize` entre 1 e 100, com ordenação estável e limite explícito. A grafia pública `transations` e os enums existentes continuam válidos; não existe alias `/transactions` nesta versão.

`POST /fixed-costs/:id/monthly/:competence/link` recebe `{ "transactionId": "id-da-despesa" }`. A API cria a mensalidade projetada se necessário, valida titular e competência, e grava vínculo único 1:1. `DELETE` na mesma rota remove só o vínculo. `GET /fixed-costs?month=YYYY-MM` devolve `monthly.transactionId` e `monthly.dueDate`. Com vínculo, apenas a transação entra nos totais financeiro, anual e por categoria; sem vínculo, a mensalidade continua como obrigação própria. A quitação e o valor da mensalidade vinculada seguem a transação. A exclusão direta de transação vinculada retorna 409.

O login Google exige `email_verified` e identidade por `googleSub`; e-mail igual não vincula contas automaticamente. O titular de uma conta local confirma a senha em `POST /auth/google/link` para iniciar um vínculo explícito, com estado temporário em cookie `HttpOnly`. Perfis Google novos podem existir sem documento ou senha local. Contas históricas precisam de inventário por ID antes de qualquer reconciliação.

Exemplo de request com IDs **fictícios** e cookie de uma conta de teste:

```http
POST /fixed-costs/fixed-test/monthly/2026-10/link HTTP/1.1
Origin: http://localhost:3000
Content-Type: application/json
Cookie: balance_auth=<cookie-de-teste>

{"transactionId":"expense-test"}
```

A resposta bem-sucedida contém, entre outros campos, `{"fixedCostId":"fixed-test","competence":"2026-10","transactionId":"expense-test","status":"PENDING","amount":"100.00"}`. Uma despesa de outro titular ou mês recebe 400; uma transação já vinculada recebe 409. Em rotas legadas, `:userId` diferente do usuário da sessão recebe 403 com `statusCode` e `message`, sem revelar dados de outra conta. O exemplo é de contrato, não uma operação em banco real.

No importador CSV, `--dry-run` não grava nem no modo `--repair-fixed`; `--sync-user` substitui o histórico do titular informado e exige backup e revisão prévia, mesmo em base fictícia. A operação é recusada quando qualquer transação desse titular está vinculada a uma mensalidade. A suíte `test/import-bkpcsv.postgres-spec.ts` cobre esses modos com CSV fictício.

### Setup e provas com banco isolado

Use Node 20 e PostgreSQL 16 em uma base **exclusiva para testes**, por exemplo `balance_test`. Configure `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET` de 32 caracteres e `FRONTEND_URL` local; habilite o OAuth somente com `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REDIRECT_URI` juntos. Execute `npm ci`, `npx prisma validate`, `npx prisma generate` e `npx prisma migrate deploy`. Uma base existente deve ser auditada antes da migration incremental com `prisma/audits/financial-integrity.sql` e `prisma/audits/legacy-groups.sql`; a migration aborta ao encontrar órfãos ou cartão de outro titular. Faça backup e planeje reparos por ID antes de qualquer upgrade real.

Verificações locais sem mutação do código: `npm run lint`, `npm run format:check`, `npm run build`, `npm run test -- --runInBand --watchman=false --testPathIgnorePatterns=ai-feedback`, `npm run test:e2e -- --runInBand --watchman=false` e `npm run test:integration`. Para ativar os testes PostgreSQL históricos, aponte `TECH008_DATABASE_URL`, `TECH011_DATABASE_URL`, `TECH014_DATABASE_URL` e `TECH015_DATABASE_URL` para a **mesma base isolada**. `test:integration` exige `TEST_DATABASE_URL` e aborta se a URL não indicar `balance_test` em host local. O workflow de CI usa PostgreSQL temporário e executa também `scripts/check-populated-upgrade.sh` com fixture fictícia. `format:check` cobre os módulos novos de configuração/data e a nova suíte PostgreSQL; a formatação integral do legado segue pendente.

Em 07/10/2026, o operador aceitou a configuração Docker existente para build local no Docker Desktop e encerrou a TECH-026 sem exigir nova prova operacional. O build da imagem de produção, o startup com PostgreSQL e o encerramento por `SIGTERM` não foram executados; portanto, devem ser comprovados antes de uma nova implantação da imagem. A migration de produção é uma etapa separada do startup. O operador confirmou em 07/10/2026 que o rollout das migrations foi concluído nos ambientes reais. Banco, revisão aplicada, janela, backup e saída do comando não foram registrados neste documento; inventários e eventuais reparos por ID continuam exigindo evidência própria.
