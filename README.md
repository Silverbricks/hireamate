# HIRE A MATE

*Your Mate. Your Time. Your Choice.*

A platonic companionship, activity and household-help marketplace for Australia (AUD, 18+).
Implements SRS v1.0, Addendum v1.1 (Home & Household Assistance, Short-Term Companion) and the
Phase 1 platform services from Addendum v1.2. **See [ROADMAP.md](ROADMAP.md) for status and what's left.**

**Stack:** Next.js 15 (App Router, server actions) · TypeScript · Tailwind v4 · Prisma 6 · PostgreSQL · Leaflet

## Run it locally

```bash
npm install
cp .env.example .env     # then set AUTH_SECRET (command in the file)
npm run db:start         # local Postgres on :5433 without Docker (keep this terminal open)
#   or: npm run db:docker    (Docker Desktop, same port and credentials)
npm run db:push          # create tables
npm run db:seed          # categories, services, 14 Mates, plans, templates, suburbs, demo accounts
npm run dev              # http://localhost:3000
```

**Signing in (development):** with `ALLOW_DEMO_LOGIN=true` (and not in production), `/signin` shows one-click
demo accounts and `/dev/inbox` shows the emails/SMS (including codes) captured by the console providers.
Seeded accounts also accept the password `MateDemo2026` (e.g. `alex@customers.example`).

**Staff demo accounts** (SRS v1.3 roles): Admin (Super Admin), Casey (Customer Support), Fiona (Finance Officer),
Sasha (Safety Officer), Vic (Verification Officer). Password sign-in for staff asks for a second code (sent by SMS).

**Production safety (SRS v1.3 s27):** a production build refuses to start if `ALLOW_DEMO_LOGIN=true`, `AUTH_SECRET`
is missing or weak, or `APP_URL` isn't https. Console email/SMS and simulated payments refuse to send or charge in
production. Map tiles need `NEXT_PUBLIC_MAP_TILE_URL` from a licensed provider. To run a production build *locally*
(`next start`, E2E), set `HAM_ENV=local`. **Never set `HAM_ENV` on a deployed environment.**

To send real messages, add provider keys to `.env` (see `.env.example`) and select the provider in
**Admin → Settings & integrations**.

## Tests

```bash
npm test                              # unit: policy, pricing, geo, timezones, identity helpers
npm run build && npm run test:e2e     # Playwright, desktop + mobile. RE-SEEDS THE DB.
npm run test:smoke                    # page/permission/privacy checks against a server on :3000
```

The E2E suite covers the milestone journey (register → verify → find nearby → request → accept → pay →
complete → review), under-18 refusal, availability enforcement, a declined payment, membership limits,
introductions and chat, support escalation, Mate approval, CSV export and access control.

## Architecture

Detailed guides: **[docs/FRONTEND.md](docs/FRONTEND.md)** (pages, components, styling, forms) and
**[docs/BACKEND.md](docs/BACKEND.md)** (server actions, platform services, auth, payments, database).

Shared platform services live in `src/server/` and are used by every service category. There are no
per-category booking, payment or notification systems.

| Service | File |
|---|---|
| Auth (sessions, OTP, passwords) | `src/server/auth.ts`, `src/app/auth-actions.ts` |
| Notifications (in-app, email, SMS, push; templates; delivery log) | `src/server/comms/*` |
| Payments (provider interface + ledger) | `src/server/payments.ts` |
| Location (geocoding, distance, travel charges) | `src/server/location.ts`, `src/lib/geo.ts` |
| Scheduling (availability, conflicts) | `src/server/calendar.ts` |
| Membership limits | `src/server/membership.ts` |
| Settings & integration manager | `src/server/settings.ts`, `/admin/settings` |
| Audit log | `src/server/audit.ts`, `/admin/audit` |
| Policy screening (non-sexual policy, contact details) | `src/lib/policy.ts` |

Privacy rules enforced in code: customers' "What do you need today?" choice never leaves the browser;
legal names, DOB, email and mobile are never selected for public pages; Mates are placed on the map by
suburb centre only; household addresses are shown to a Mate only after acceptance; one-time codes are
redacted from delivery logs for real providers.
