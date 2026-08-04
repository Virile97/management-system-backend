# Management System Backend

Express + Prisma + Supabase (PostgreSQL) REST API.

## Stack

- Node.js / Express (plain JavaScript, CommonJS)
- Prisma ORM
- Supabase (Postgres + client SDK)
- Zod for request validation
- JWT auth with bcrypt password hashing
- Pino for logging

## Getting started

1. Copy `.env.example` to `.env` and fill in your Supabase project values (`DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, keys, `JWT_SECRET`).
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate the Prisma client and run migrations:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```
4. Seed the database (optional):
   ```bash
   npm run prisma:seed
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```

API is served under `API_PREFIX` (default `/api/v1`). Health check: `GET /api/v1/health`.

## Scripts

- `npm run dev` — start with nodemon
- `npm start` — start in production mode
- `npm test` — run tests with vitest
- `npm run lint` / `npm run lint:fix` — ESLint
- `npm run format` — Prettier
- `npm run prisma:studio` — open Prisma Studio

## Structure

- `prisma/` — schema, migrations, seed script
- `src/config/` — env, Prisma client, Supabase client, logger, constants
- `src/modules/` — feature modules (`auth`, `users`, `posts`), each with controller/service/repository/routes/validation
- `src/middlewares/` — auth, validation, error handling, rate limiting, request logging
- `src/shared/` — errors, utils, validators, interfaces reused across modules
- `src/routes/` — top-level route aggregation
- `tests/` — unit and integration tests
