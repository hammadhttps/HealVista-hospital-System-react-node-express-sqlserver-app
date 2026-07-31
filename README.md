# HealVista — PERN + AI Hospital Management System

A production-oriented Hospital Management System built on the **PERN** stack
(**P**ostgreSQL, **E**xpress, **R**eact, **N**ode) with an **AI** layer: front desk, clinical records,
pharmacy, laboratory, billing, and a Gemini + pgvector RAG over patient data.

## Stack

| Layer        | Technology                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| Frontend     | React 19 + Vite, TypeScript, Tailwind v4 + shadcn/ui, TanStack Query, Zustand |
| Backend      | Node 20 + Express 5, TypeScript, Prisma                                       |
| Database     | PostgreSQL (Neon) + pgvector                                                  |
| Cache/Queues | Redis (Upstash / Docker)                                                      |
| AI           | Google Gemini (free tier) + pgvector RAG                                      |
| Payments     | Stripe + Razorpay                                                             |

**PERN + AI**: PostgreSQL · Express · React · Node · Gemini RAG

## Getting started

```bash
# 1. Start local infrastructure
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
# Fill in DATABASE_URL, JWT secrets, etc.

# 4. Run database migration and seed
npm run db:migrate
npm run db:seed

# 5. Start both apps in dev mode
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:5000
- API docs: http://localhost:5000/api/docs

## Project structure

```
apps/client/        React frontend (Vite)
apps/server/        Express API + BullMQ workers
packages/shared/    Zod schemas, types, constants
docs/               Architecture, setup, roadmap
```

## Available commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start both apps                      |
| `npm run dev:client` | Vite dev server on :5173             |
| `npm run dev:server` | Express dev server on :5000          |
| `npm run build`      | Build all packages                   |
| `npm run typecheck`  | TypeScript check across all packages |
| `npm run lint`       | ESLint across all packages           |
| `npm run test`       | Run all tests (Vitest)               |
| `npm run db:migrate` | Prisma migrate dev                   |
| `npm run db:seed`    | Seed demo data                       |
| `npm run db:studio`  | Prisma Studio                        |

## Architecture rules

- **Backend**: Routes → Controller → Service → Prisma. Never skip or invert.
- **Frontend**: TanStack Query for server state, Zustand for client state. No `useEffect` fetching.
- **AI**: Gemini behind `AIProvider` interface. RAG with pgvector. Permissions filtered before retrieval.
- **Database**: Soft deletes (`deletedAt`), audit logs for clinical/financial writes.

See `docs/architecture/` for details.

## Roles

`PATIENT` · `DOCTOR` · `RECEPTIONIST` · `PHARMACIST` · `LAB_TECHNICIAN` · `ACCOUNTANT` · `ADMIN`

## Deployment

See `docs/setup/` for Neon, Upstash, and deployment guides.
