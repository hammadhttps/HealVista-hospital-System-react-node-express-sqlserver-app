# HealVista — PERN + AI Hospital Management System

A production-oriented Hospital Management System built on the **PERN** stack
(**P**ostgreSQL, **E**xpress, **R**eact, **N**ode) with an **AI** layer: front desk, clinical records,
pharmacy, laboratory, billing, and a Jina AI + pgvector RAG over patient data.

Seven roles, seven dashboards, one system: a patient books an appointment and pays online, a
receptionist checks them in and takes the cash, a doctor writes a SOAP note and drafts it with AI,
the pharmacist dispenses with allergy and interaction safety checks, the lab verifies results, the
accountant refunds a card payment, and the admin watches no-show rates and revenue by department.

## Stack

| Layer        | Technology                                                                    |
| ------------ | ----------------------------------------------------------------------------- |
| Frontend     | React 19 + Vite, TypeScript, Tailwind v4 + shadcn/ui, TanStack Query, Zustand |
| Backend      | Node 20 + Express 5, TypeScript, Prisma                                       |
| Database     | PostgreSQL (Neon) + pgvector                                                  |
| Cache/Queues | Redis (Upstash / Docker) + BullMQ                                             |
| AI           | Jina AI + pgvector RAG                                                        |
| Payments     | Stripe (card) + Razorpay, plus cash                                           |
| Comms        | Nodemailer, Twilio SMS, Socket.io, in-app notifications                       |

**PERN + AI**: PostgreSQL · Express · React · Node · Jina AI RAG

## Features

**Phase 1 — Foundation & Identity**

- 7 roles with a JWT access/refresh flow and account lockout
- Departments, staff management, patient registration (walk-in + self-serve)
- Admin verification for new doctors

**Phase 2 — Scheduling & Front Desk**

- Doctor slot generation, booking, rescheduling, cancellation
- QR check-in at the front desk, queue tokens, live waiting-room display
- Walk-in registration by the receptionist

**Phase 3 — Billing & Communications**

- Consolidated bills (consultation + lab + pharmacy), drafts, finalisation with tax
- Discounts (percentage/fixed) with a **live total preview** before applying; one per bill
- Partial payments — cash by reception, card online via Stripe Elements; automatic status transitions
- Refunds (full/partial) that go back through the payment gateway; printable receipts
- Notifications fanning out to in-app + email + SMS with per-user preferences
- 24h/1h reminders and doctor-set follow-up reminders via BullMQ

**Phase 4 — Clinical Core**

- SOAP notes with templates, auto-save, and AI draft assist
- Prescriptions with deterministic allergy and drug-interaction safety checks
- Pharmacy: inventory, low-stock, batch/expiry management
- Laboratory: sample workflow, barcode tracking, pathologist verification, critical-flagging
- Vitals, referrals, dependant profiles, full medical history

**Phase 5 — AI & Semantic Layer**

- Jina AI behind an `AIProvider` interface; PII stripped before every external call
- pgvector embeddings + HNSW; retrieval scoped by permission **in the SQL itself**
- Patient/doctor assistants, report/lab/prescription explainers, SOAP drafts
- Hospital knowledge base, analytics assistant (the model narrates, never authors SQL)
- Deterministic safety rails: emergency detection, allergy/interaction warnings

**Phase 6 — Analytics, Admin & Hardening**

- Role dashboards with live KPIs (60s Redis cache)
- Operational analytics: no-show rate, waiting times, doctor utilisation, revenue by department
- Global search (Postgres `tsvector` + GIN) filtered by the caller's role; `Cmd+K` palette
- Audit & compliance: append-only audit log, per-patient activity timeline, async export, anonymised delete
- Google OAuth for patients (staff accounts rejected server-side)
- WCAG 2.1 AA (axe-tested flows), dark mode, i18n English + Urdu (RTL), print stylesheets
- Helmet CSP, Redis rate limits, structured logging, route-level code splitting

## Getting started

```bash
# 1. Start local infrastructure (Postgres + pgvector, Redis)
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
# Fill in DATABASE_URL, JWT secrets, JINA_API_KEY (https://jina.ai), etc.

# 4. Run database migration, seed, and backfill AI embeddings
npm run db:migrate
npm run db:seed
npm run db:embed

# 5. Start both apps in dev mode
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:5000
- API docs: http://localhost:5000/api/docs

Setup guides live in `docs/setup/` (Neon Postgres, Upstash Redis, payments, local development).

## Project structure

```
apps/client/        React frontend (Vite)
apps/server/        Express API + BullMQ workers
packages/shared/    Zod schemas, types, constants
docs/               Architecture, setup, roadmap, phase reports
```

## Available commands

| Command              | Description                          |
| -------------------- | ------------------------------------ |
| `npm run dev`        | Start both apps                      |
| `npm run dev:client` | Vite dev server on :5173             |
| `npm run dev:server` | Express dev server on :5000          |
| `npm run worker`     | BullMQ workers                       |
| `npm run build`      | Build all packages                   |
| `npm run typecheck`  | TypeScript check across all packages |
| `npm run lint`       | ESLint across all packages           |
| `npm run test`       | Run all tests (Vitest)               |
| `npm run db:migrate` | Prisma migrate dev                   |
| `npm run db:seed`    | Seed demo data                       |
| `npm run db:embed`   | Backfill pgvector embeddings         |
| `npm run db:studio`  | Prisma Studio                        |

## Architecture rules

- **Backend**: Routes → Controller → Service → Prisma. Never skip or invert.
- **Frontend**: TanStack Query for server state, Zustand for client state. No `useEffect` fetching.
- **AI**: Jina AI behind `AIProvider` interface. RAG with pgvector. Permissions filtered **before** retrieval.
- **Database**: Soft deletes (`deletedAt`), audit logs for every clinical/financial write.

See `docs/architecture/` for details.

## Roles

`PATIENT` · `DOCTOR` · `RECEPTIONIST` · `PHARMACIST` · `LAB_TECHNICIAN` · `ACCOUNTANT` · `ADMIN`

## Deployment

See `docs/setup/` for Neon, Upstash, and deployment guides.
