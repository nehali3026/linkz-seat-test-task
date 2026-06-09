# Linkz Seat Reservation Platform

Senior Engineer technical assessment implementation: a small public seat reservation platform built with **Next.js**, **TypeScript**, **Prisma**, **SQLite**, and **NextAuth**.

## Features

- **3 public seats** displayed on the home page
- **Authentication** with email/password and **90-day session expiry**
- **Seat selection** with temporary holds (10 minutes)
- **Mock payment flow** that confirms reservations only after successful payment
- **Concurrency-safe reservation logic** to prevent double booking under race conditions
- **Idempotent payment initiation** to safely retry checkout

## Engineering decisions

| Concern | Approach |
| --- | --- |
| Concurrency | Conditional seat updates inside DB transactions (`AVAILABLE` → `HELD` → `RESERVED`) |
| Checkout safety | Time-bound holds expire automatically; expired holds are released lazily on reads |
| Payment reliability | Idempotency keys prevent duplicate payment records on retries |
| Session policy | JWT sessions with `maxAge` set to 90 days |
| Operational simplicity | SQLite for zero-infra local development; schema is portable to PostgreSQL |
| Failure handling | Declined cards release holds; API returns structured error codes |

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Prisma 7 + SQLite
- NextAuth v5 (credentials provider)
- Tailwind CSS

## Prerequisites

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
cp .env.example .env
npm run setup
npm run dev
```

Open [http://localhost:3001](http://localhost:3001).

## Environment configuration

Copy `.env.example` to `.env` and configure:

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | SQLite connection string (`file:./dev.db`) |
| `AUTH_SECRET` | Secret for signing session tokens. Generate with `openssl rand -base64 32` |
| `PORT` | Dev server port (`3001` locally; avoids conflict with other apps on 3000) |
| `AUTH_URL` | Public app URL (`http://localhost:3001` locally) |
| `NODE_ENV` | `development` for local use |

Never commit real secrets. `.env` is gitignored by default.

## Demo accounts

| Email | Password |
| --- | --- |
| `alice@example.com` | `password123` |
| `bob@example.com` | `password123` |

## User flow

1. Sign in at `/login`
2. Select an available seat on `/`
3. Seat is held for 10 minutes
4. Complete mock payment at `/payment`
5. Reservation is confirmed and seat becomes `RESERVED`

## Mock payment behavior

- **Success:** any valid-length card number except the failure test card
- **Decline:** `4000000000000002`
- Failed payments release the seat hold so another user can book

## API endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/seats` | List seats and current status |
| `POST` | `/api/reservations/hold` | Create a seat hold (auth required) |
| `POST` | `/api/payments/initiate` | Start checkout for a hold (auth required) |
| `POST` | `/api/payments/process` | Process mock payment and confirm reservation |

## Useful scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run setup        # Migrate database and seed data
npm run db:migrate   # Apply Prisma migrations
npm run db:seed      # Seed demo users and seats
npm run db:reset     # Reset database and re-seed
npm run db:studio    # Open Prisma Studio
npm run test:stress  # Load + negative-case API tests
```

### Stress / negative testing

Run the app first, then reset seats for reliable race-condition tests:

```bash
npm run dev
# in another terminal
npm run db:reset
npm run test:stress
```

Optional flags:

```bash
npm run test:stress -- --concurrency=50
BASE_URL=http://localhost:3001 npm run test:stress
```

The script covers:

| Scenario | Expected result |
| --- | --- |
| Hold without login | `401` |
| Invalid credentials | Login rejected |
| Malformed request body | `400` |
| Invalid seat id | `400` / `409` |
| Two users, one seat (race) | Exactly 1 success, 1 conflict |
| Declined card | `402`, seat released |
| User pays another user's hold | `400` / `403` |
| Concurrent `GET /api/seats` | All `200`, throughput reported |

For heavier load (100+ virtual users, sustained traffic), use [k6](https://k6.io/) or [autocannon](https://github.com/mcollina/autocannon) against the same endpoints with session cookies from the login flow in `scripts/stress-test.ts`.

## Project structure

```text
src/
  app/                 # Pages and API routes
  components/          # UI components
  lib/                 # Auth, reservation, payment, and DB utilities
prisma/
  schema.prisma        # Data model
  seed.ts              # Seed script
```