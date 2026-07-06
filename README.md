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

# Optional
PORT=4000
NODE_ENV=development
```

Notes:

- `DATABASE_URL` is required by Prisma.
- `JWT_SECRET` is required by the `JwtModule`.
- `FRONTEND_URL` is used as the redirect target after Google login.
- `FRONTEND_URLS` can include extra origins (comma-separated) for CORS.
- Auth cookies are named `balance_auth`.

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
npm start
```

Keep `NODE_ENV=production` in runtime.

## CORS

The app currently allows credentials and these frontend origins:

- `http://localhost:3000`
- `http://localhost:3001`
- `https://balance-2olb8gbo5-ivan-barbosas-projects.vercel.app`
- `https://balance-neon.vercel.app`

Additionally, origins from `FRONTEND_URL` and `FRONTEND_URLS` (comma-separated) are also allowed.

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
