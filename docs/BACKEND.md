# Backend

The backend runs inside the same Next.js app as the frontend (see [FRONTEND.md](FRONTEND.md)). There is no
separate API server: pages read data on the server, and **server actions** handle every write. Shared
platform services live in `src/server/` and are used by all service categories, so there is one booking,
payment, notification and membership system, not one per category.

**Tech:** Node.js · Next.js server actions and route handlers · Prisma 6 · PostgreSQL · zod

## Folder map

```
prisma/
├── schema.prisma             # Database schema (all models and enums)
└── seed.ts                   # Demo data: categories, services, Mates, customers, staff, plans, templates, suburbs

src/
├── instrumentation.ts        # Runs at server start: assertSafeConfig() refuses unsafe production config
├── app/
│   ├── actions.ts            # Bookings: create, respond, pay, advance, complete, cancel, chat, review, report, SOS, block
│   ├── auth-actions.ts       # Register, verify, sign in (password / code / staff 2FA), sessions, sign out, demo sign-in
│   ├── account-actions.ts    # Notifications, preferences, saved places, favourites, introductions, subscriptions, tickets
│   ├── mate-actions.ts       # Mate profile and availability
│   ├── admin-actions.ts      # Staff actions; every one starts with requirePermission()
│   └── admin/export/route.ts # CSV export route handler
├── server/                   # Platform services (server-only)
│   ├── env.ts                # Production-safety gate: isProduction(), devFeaturesEnabled(), assertSafeConfig()
│   ├── auth.ts               # scrypt passwords, DB sessions, OTP codes, staff 2FA cookie
│   ├── settings.ts           # Admin-editable platform settings with defaults (pricing, booking, location, security)
│   ├── payments.ts           # PaymentProvider adapter + PaymentTransaction ledger (simulated provider only for now)
│   ├── membership.ts         # Current plan and plan limits
│   ├── calendar.ts           # Availability windows and booking conflicts
│   ├── location.ts           # Geocoding adapter (built-in gazetteer / Google) and suburb list
│   ├── blocks.ts             # User blocking checks
│   ├── audit.ts              # Audit log writer
│   ├── ratelimit.ts          # In-memory rate limiting
│   └── comms/
│       ├── providers.ts      # Email (console / Resend), SMS (console / Twilio), push (console) adapters
│       ├── events.ts         # Notification events and which channels they use
│       └── notify.ts         # notify(): templates, preferences, quiet hours, delivery log, OTP redaction
└── lib/                      # Shared helpers (server and client)
    ├── db.ts                 # Prisma client singleton
    ├── session.ts            # currentUser, requireUser, requirePermission, requireVerifiedUser
    ├── permissions.ts        # Staff roles → permissions matrix, can()
    ├── admin-nav.ts          # Admin menu entries and the permission each needs
    ├── identity.ts           # Age checks, email/mobile normalising
    ├── mates.ts              # Mate search (approved only, distance, filters)
    ├── pricing.ts            # priceBooking(): hours × rate, travel charge, customer fee, commission
    ├── geo.ts                # Haversine distance, coordinate rounding (~1 km)
    ├── policy.ts             # Non-sexual policy and contact-detail screening for text
    ├── status.ts             # Booking status flow and labels
    └── format.ts             # Money and Australia/Sydney date formatting

scripts/
├── dev-db.mjs                # Embedded PostgreSQL on :5433 (no Docker needed), UTF-8
├── unit.test.ts              # Unit tests (node:test via tsx)
└── smoke.mjs                 # Page, permission and privacy checks against a running server
e2e/booking.spec.ts           # Playwright journeys, desktop + mobile
```

## Request flow

```
Browser form ──► server action (src/app/*-actions.ts)
                   1. requireUser() / requirePermission()      src/lib/session.ts
                   2. validate input with zod
                   3. rate limit, block and policy checks      src/server/ratelimit.ts, blocks.ts, lib/policy.ts
                   4. business logic via platform services     src/server/*
                   5. Prisma writes (in a transaction where money or status changes)
                   6. audit log + notify()                     src/server/audit.ts, comms/notify.ts
                   7. revalidatePath() → page re-renders
```

## Auth and access

- Passwords are hashed with scrypt. Sessions are stored in the database; only a SHA-256 hash of the token
  is kept, and the browser holds an httpOnly `ham_session` cookie.
- One-time codes are HMAC-hashed with an expiry and an attempt limit. Accounts lock after repeated failures.
- Staff sign in with password + SMS code (`ham_2fa` signed cookie). Code-only sign-in is blocked for staff.
- Roles: `CUSTOMER`, `MATE`, `ADMIN`. Admin users also have one of 15 `StaffRole`s. `src/lib/permissions.ts`
  maps roles to permissions; pages and actions check with `requirePermission()`.

## Bookings and money

Status flow: `REQUESTED → (Mate accepts) → PENDING_PAYMENT → (customer pays) → CONFIRMED → IN_PROGRESS →
COMPLETED`, plus `DECLINED` and `CANCELLED`. A free first meet ($0) is confirmed as soon as the Mate accepts.

Every money movement is a `PaymentTransaction` row with an idempotency key, gross amount, commission and
fee, so the ledger is traceable. Commission defaults to the platform rate and can be overridden per
category. **Only the simulated payment provider exists**; it refuses to run in production. Real Stripe
Connect is waiting on Stripe's approval of the marketplace model. The platform does not claim to hold funds
in escrow.

## Provider adapters

| Area | Providers | Selected in |
|---|---|---|
| Email | console (dev), Resend | Admin → Settings & integrations |
| SMS | console (dev), Twilio | Admin → Settings & integrations |
| Push | console (dev) | — |
| Maps / geocoding | built-in gazetteer, Google | Admin → Settings & integrations |
| Payments | simulated (dev) | — (Stripe pending approval) |

Keys come from environment variables only (see `.env.example`); they are never sent to the browser.

## Production safety

`src/server/env.ts` + `src/instrumentation.ts`. A production build **refuses to start** if
`ALLOW_DEMO_LOGIN=true`, `AUTH_SECRET` is missing or under 32 characters, or `APP_URL` isn't https.
Development features (demo login, dev inbox, on-screen codes, simulated payments, console providers, OSM
tiles) only work when explicitly enabled **and** not in production; a missing variable never turns them on.
`HAM_ENV=local` exists only to run a production build on a developer machine and must never be set on a
deployed environment.

## Database

PostgreSQL via Prisma. Schema changes are currently applied with `npm run db:push` (no migration history
yet; this must change before any shared or production database, see ROADMAP.md).

```bash
npm run db:start   # embedded Postgres on :5433 (or: npm run db:docker)
npm run db:push    # apply schema
npm run db:seed    # demo data (password for seeded accounts: MateDemo2026)
```

## Tests

```bash
npm test                            # unit tests
npm run build && npm run test:e2e   # Playwright desktop + mobile (re-seeds the database)
npm run test:smoke                  # checks against a server on :3000
```
