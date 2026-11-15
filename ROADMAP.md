# HIRE A MATE: Development Roadmap & SRS v1.3 Compliance Check

**Authoritative progress document (SRS v1.3 s29).** Last updated: **14 November 2026**.
Checked point by point against the code and automated tests, not against UI or tables alone.

**Statuses used (s29):** Not Started · In Progress · Partially Complete · Code Complete · Integration Tested · End-to-End Tested · Approved for Production.
"End-to-End Tested" here means tested in a local production build **with development providers** (console email/SMS, simulated payments, OpenStreetMap tiles). **Nothing is Approved for Production.**

**Regression baseline (s28.1):** 11/11 unit tests · 12/12 Playwright journeys (6 desktop + 6 mobile) · clean production build · smoke check on every page. Commands are in README.md; Playwright traces are kept in `test-results/` on failure.

---

## 1. Module status (s29 format)

| # | Feature | Status | Owner | Depends on | Test evidence | Outstanding / known limitations | Prod-ready |
|---|---|---|---|---|---|---|---|
| 1 | Registration & sign-in (email, mobile, OTP, reset, lockout) | End-to-End Tested | Claude Code | Real SMS/email providers | E2E: register→verify, invalid OTP, wrong password, sign-in by email & mobile | Expired-OTP, lockout and password-reset not E2E-tested; rate limiter is in-memory | No |
| 2 | Staff two-step sign-in (s6.3) | End-to-End Tested | Claude Code | SMS provider | E2E: password + SMS code, wrong code rejected, code-only sign-in refused for staff | Authenticator-app/passkey option not offered | No |
| 3 | Device/session management (s6.3) | Code Complete | Claude Code | – | Smoke: account page renders sessions | No E2E for revoking a session | No |
| 4 | Age assurance (s6.2, Gate 2) | Partially Complete | Unassigned | IDV/age-assurance vendor | E2E: under-18 refused; unit: age maths | **DOB only.** No approved age-assurance method, no failed/inconclusive handling | **Blocker** |
| 5 | Identity verification (s8, Gate 2) | Not Started | Unassigned | Vendor choice, secure storage | – | Only a manual "mark verified" flag. No documents, liveness, police/WWCC, bank checks | **Blocker** |
| 6 | Staff roles / RBAC (s4.3, s21) | End-to-End Tested | Claude Code | – | Unit: 15-role matrix; E2E: Support/Finance/Verification/Safety/Super Admin access | Matrix defined in code (not editable in Admin); **Regional Manager not scoped to region** | No |
| 7 | Mate application & profile (s7.1–7.3) | End-to-End Tested | Claude Code | Media, IDV, Stripe onboarding | E2E: decision reasons shown to Mate; smoke: editor | Application doesn't capture verification or payout-onboarding info (needs #5, #13) | No |
| 8 | Mate approval workflow (s7.4) | End-to-End Tested | Claude Code | – | E2E: request info (reason required) → Mate sees reason → Super Admin approves; audit entry | Appeals go through a support category, not a dedicated flow | No |
| 9 | Search (s9.1) | End-to-End Tested | Claude Code | – | E2E: name, location/radius, household filters | **No minimum-rating filter** (reviews affect ranking only) | No |
| 10 | Maps & location (s9.2–9.4) | Partially Complete | Claude Code | Licensed maps provider | E2E: map view, distance search, travel charge | No reverse geocoding, directions, Places autocomplete (suburb list only) or location-based activity discovery; built-in gazetteer ~50 suburbs | No |
| 11 | Travel charges (s9.4) | Code Complete | Claude Code | – | Unit: per-km/minimum; E2E: distance shown | Fixed charge added in v1.3 without its own E2E test | No |
| 12 | Booking engine (s10) | End-to-End Tested | Claude Code | Stripe | E2E: request, availability refusal, accept, pay (decline + success), progress, complete, review | **Not built:** multiple-Mate selection UI, rescheduling, disputes, no-show, custom recurrence; decline/cancel/refund paths not E2E-tested | No |
| 13 | Payments / Stripe Connect (s13, Gate 3) | Partially Complete | Unassigned | **Stripe business approval** | E2E: simulated charge + decline; ledger rows | Simulated provider only (refuses in production). No authorise/capture split, Connect onboarding, payouts, disputes, webhooks, reconciliation, country/promotional commission, tax fields | **Blocker** |
| 14 | Financial ledger (s13.5) | Code Complete | Claude Code | Stripe | E2E: ledger CSV contains captures | Mate ID, gross and commission are recorded on payouts; customer ID and fees on captures. No reconciliation job or adjustments | No |
| 15 | Membership (s14) | Partially Complete | Claude Code | Stripe Billing | E2E: subscribe to Customer Plus | No renewals, failed-payment handling, grace periods, coupons or country pricing. Customer plan feature lists now only claim what exists (limits + priority support). **Mate Plus/Professional benefits (extra videos, featured placement, advanced analytics) depend on unbuilt modules, so don't sell Mate paid plans yet** | No |
| 16 | Introduce Yourself & free first meet (s11) | End-to-End Tested | Claude Code | – | E2E: intro → chat locked → accept → chat → $0 free meet → second free meet refused → Mate accepts without payment | Weekly limit and Mate-side block not E2E-tested | No |
| 17 | Messaging (s12.1) | End-to-End Tested | Claude Code | – | E2E: booking + intro chat; policy screening (unit) | **No attachments**; no moderation queue for flagged messages | No |
| 18 | Notifications (s12.2–12.5) | Partially Complete | Claude Code | Providers, FCM | E2E: in-app notification, emails in dev inbox | **No web/mobile push.** Real Twilio/Resend untested; no bounce webhooks or unsubscribe links; sends are synchronous (no queue) | No |
| 19 | Integration management (s17.5) | Code Complete | Claude Code | Provider credentials | Smoke: settings page; test-send button | No usage/cost reports; retry is manual only | No |
| 20 | Support & incidents (s19) | End-to-End Tested | Claude Code | – | E2E: SOS → restricted urgent ticket visible to Safety Officer, hidden from Customer Support | **No evidence attachments**; customer account suspension has no UI; appeals are a ticket category | No |
| 21 | Emergency features (s19.3) | End-to-End Tested | Claude Code | SMS provider | E2E: SOS during confirmed booking, "not an emergency service" wording | Emergency-contact SMS untested against a real provider | No |
| 22 | Blocking (s11.2, s12.1, s16.2) | End-to-End Tested | Claude Code | – | E2E: customer blocks Mate → profile shows block, intro form hidden | – | No |
| 23 | Analytics (s20) | Code Complete | Claude Code | Stripe (fees) | E2E: overview + CSV | Payment fees n/a until Stripe; "active Mates" = approved; repeat **rate** shown as a count; **no automated reconciliation test** against records | No |
| 24 | Admin & configuration (s21) | Partially Complete | Claude Code | – | Smoke: all admin pages | **Missing:** customer/user management, bookings list, admin refunds/payouts, service create/edit (toggle only), group-activity creation, promotions, country settings, legal documents | No |
| 25 | Production environment safety (s27) | Integration Tested | Claude Code | – | Unit: env rules; **verified: unsafe production start refuses to boot** | Map tiles need a licensed URL; deployment pipeline not yet defined | No |
| 26 | Photos & videos (s15) | Not Started | Unassigned | Storage + moderation vendor | – | Plan limits configured (10 photos; 1/2/5 videos) | **Blocker (Gate 4)** |
| 27 | Gifts, Gift Credits, Mate Points (s16) | Not Started | Unassigned | Legal advice on stored value; app-store rules | – | Blocks and "gifts never unlock chat/affect ranking" already hold | **Blocker (Gate 4)** |
| 28 | Mobile apps (s18) | Not Started | Unassigned | Stable API, push | Web journeys pass at mobile size | No native apps, push, deep links or crash monitoring | **Blocker (Gate 5)** |
| 29 | Internationalisation (s24) | Not Started | Unassigned | Legal per country | – | Locale/timezone fields only; times fixed to Australia/Sydney | No (not needed for AU launch) |
| 30 | Legal & compliance (s22, Gate 1) | Not Started | Project lead | External advisers | – | Start immediately | **Blocker** |
| 31 | Database migrations (s25.3) | Not Started | Unassigned | – | – | **Schema is applied with `prisma db push`; no migration history or rollback.** Switch to `prisma migrate` before any shared/production database | **Blocker** |
| 32 | Operations: backups, monitoring, background jobs (s23) | Not Started | Unassigned | Hosting choice | – | No job runner (payment-window expiry, membership renewals, queued notifications), no error/uptime monitoring, no backup/restore test | **Blocker** |

---

## 2. SRS v1.3 section-by-section recheck

✓ = implemented and tested · ◐ = partial · ✗ = not implemented · n/a = not a software item

| § | Requirement | Result | Notes |
|---|---|---|---|
| 1 | Positioning: platonic, not dating/escort/clinical | ✓ | Footer, Safety page, policy screen, booking acknowledgement |
| 2 | 20 objectives | ◐ | 13 met in dev; gifts (14), mobile (18), international (19), real payments (10) outstanding; ID verification (4) partial |
| 3 | Status table | ◐ | **Superseded by this document**, which now records verified results |
| 4.1 | Customer capabilities | ◐ | All except send gifts, earn/redeem rewards |
| 4.2 | Mate capabilities | ◐ | Missing: ID verification, photos/videos, real payouts, referrals/rewards |
| 4.3 | 15 staff roles + audit | ✓ | Regional scoping outstanding |
| 5.1–5.7 | Service categories | ◐ | 16 categories / 53 services seeded. Some v1.3 services not seeded (e.g. breakfast/brunch, street food, engagement parties, fishing, painting, cruises, garage organisation, dusting, product comparison). **Admin can't create services in the UI yet** |
| 5.3 | No false couple/romance representation | ✓ | Policy screen blocks "pretend to be my partner" requests |
| 5.6 | Only non-regulated household tasks | ✓ | Restricted task register shown on every booking |
| 6.1 | Registration & login security | ✓ | Expired-OTP/lockout/reset need E2E tests |
| 6.2 | Age assurance | ◐ | DOB + enforcement only (Gate 2) |
| 6.3 | Account security, staff 2FA, session management, no demo in prod | ✓ | |
| 7.1 | Mate application fields | ◐ | Verification + payment onboarding info missing |
| 7.2 | Profile sections | ◐ | Photos and intro video missing |
| 7.3 | Qualities | ✓ | 29 qualities |
| 7.4 | Approve/reject/request info/suspend/re-verify/restrict services/reasons | ✓ | |
| 8 | Identity & age verification, document privacy | ✗ | Gate 2 |
| 9.1 | Search criteria | ◐ | Missing: minimum-rating filter |
| 9.2 | Maps functions + licensed provider | ◐ | See module 10 |
| 9.3 | Location privacy | ✓ | Approximate areas only; no live location stored or shown |
| 9.4 | Travel charges | ✓ | Fixed, per-km, minimum, none; expenses disclosed |
| 10.1 | Booking workflow | ◐ | Multiple-Mate selection missing |
| 10.2 | Booking types | ◐ | One-time ✓, recurring ✓, household ✓, short-term ✓, event ✓; multiple-Mate UI ✗; travel switched off |
| 10.3 | Statuses | ◐ | All 16 defined; Draft, Payment Authorised, Disputed, Failed and No Show have no workflow yet |
| 10.4 | Recurring + per-session acceptance | ◐ | Custom schedules ✗ |
| 10.5 | Group bookings | ◐ | Join public/approval groups ✓; **no UI to create group activities**; private/invite-only not usable |
| 11 | Introduce Yourself, Mate controls, free first meet | ✓ | |
| 12.1 | Messaging, report & block, gifts never unlock chat | ◐ | Attachments ✗ |
| 12.2 | Channels | ◐ | Web/mobile push ✗ |
| 12.3–12.4 | Production SMS/email testing | ✗ | Needs credentials; test-send button ready |
| 12.5 | Notification centre, preferences, quiet hours | ✓ | |
| 13 | Payments, Stripe, commission, ledger | ◐ | Interface, ledger and commission settings ✓; real payments ✗ (Gate 3) |
| 14 | Membership | ◐ | See module 15: Mate paid-plan benefits not yet deliverable |
| 15 | Photos & video, YouTube | ✗ | Gate 4 |
| 16 | Gifts, credits, points, inbox | ✗ | Gate 4 |
| 17 | Integrations | ◐ | Push and usage reports ✗ |
| 18 | Mobile apps | ✗ | Gate 5 |
| 19.1 | Ticket categories & statuses | ✓ | |
| 19.2 | Safety incidents, restricted access | ◐ | Evidence attachments, customer suspension UI, appeal workflow ✗ |
| 19.3 | SOS, check-in/out, emergency contact, instructions | ✓ | |
| 20 | Analytics | ◐ | Reconciliation test ✗; payment fees n/a |
| 21 | Admin manages… | ◐ | See module 24 for the missing list |
| 22 | Legal review | ✗ | Gate 1, start now |
| 23.1 | Security | ◐ | Encryption at rest/in transit (hosting), backups, vulnerability testing, distributed rate limiting ✗ |
| 23.2–23.3 | Performance & reliability | ✗ | Background jobs, monitoring, health checks |
| 23.4 | Accessibility | ◐ | Labelled forms, keyboard-reachable controls, contrast via brand tokens; **no formal WCAG audit** |
| 24 | International | ✗ | Not needed for AU launch |
| 25.1 | Architecture documented | ◐ | README + §3 below; deployment and mobile architecture not yet defined |
| 25.2 | Shared services | ✓ | One booking, payment, notification, membership and location system |
| 25.3 | Migrations & rollback | ✗ | Uses `db push`; must move to `prisma migrate` |
| 25.4 | Provider adapters | ◐ | Payments, email, SMS, push, maps ✓; IDV adapter ✗ (no vendor yet) |
| 26 | Release gates | – | See §4 |
| 27 | Production environment safety | ✓ | Verified by a real unsafe production start |
| 28 | Testing | ◐ | Baseline kept; gaps listed in §5 |
| 29 | Roadmap governance | ✓ | This document |
| 30 | Launch checklist | ✗ | Not ready: see §4 |
| 31 | Initial launch scope | ◐ | Travel switched off ✓; **activation by country/region ✗** (global on/off only) |
| 32 | Directive | – | Followed: foundation preserved, no duplicate systems |

---

## 3. Shared interfaces (for allocating developers)

| Concern | Interface | File |
|---|---|---|
| Auth & sessions | `sessionUser`, `requireUser`, `requireVerifiedUser`, `requirePermission`, `issueOtp`/`verifyOtp`, 2FA helpers | `src/server/auth.ts`, `src/lib/session.ts` |
| Permissions | `can(user, permission)`, `ROLE_PERMISSIONS` | `src/lib/permissions.ts` |
| Payments | `PaymentProvider { charge, refund, payout }` + ledger helpers | `src/server/payments.ts` |
| Email / SMS / push | Provider adapters; `notify()`, `sendOtp()`, `sendSms()`, `sendTest()` | `src/server/comms/*` |
| Location | `geocode()`, `haversineKm`, `travelFeeCents` | `src/server/location.ts`, `src/lib/geo.ts` |
| Scheduling | `withinAvailability`, `conflicts` | `src/server/calendar.ts` |
| Membership | `currentPlan`, `assertWithinLimit` | `src/server/membership.ts` |
| Safety | `screenText`, `isBlockedBetween`, `raiseSos` | `src/lib/policy.ts`, `src/server/blocks.ts`, `src/app/actions.ts` |
| Settings & env | `getSettings()`, `devFeaturesEnabled()`, `configProblems()` | `src/server/settings.ts`, `src/server/env.ts` |
| Audit | `audit()` | `src/server/audit.ts` |

**Recommended next assignments, in dependency order.** No two of these touch the same tables:

1. **Migrations + job runner** (#31, #32). Unblocks everything shared.
2. **IDV/age vendor** behind a new `IdentityProvider` adapter (#4, #5).
3. **Stripe** behind `PaymentProvider`, once Stripe approves the model (#13, #14).
4. **Media** (#26), then **Gifts** after legal advice (#27).
5. **Mobile** (#28), against the existing server actions or a thin API layer.

---

## 4. Release gates (s26)

| Gate | Status | Done in code | Still required for exit |
|---|---|---|---|
| 1 Legal & business model | **Outstanding** | Policies in product; non-sexual screening | Written legal advice, Mate classification, insurance, Stripe model confirmation |
| 2 Identity, age & Mate verification | **Outstanding** | Approval workflow with reasons, re-verify, suspend, audit, staff permissions | Verification vendor tested; failed/inconclusive handling; secure documents; appeals |
| 3 Real payments & communication | **Partially Complete** | Payment interface, ledger, commission settings, refunds (simulated); Twilio/Resend adapters; test-send | Stripe Connect, webhooks, payouts, disputes, reconciliation; real SMS/email delivery tests |
| 4 Media, gifts & engagement | **Partially Complete** | Introduce Yourself, chat permissions, free meet, blocking (E2E) | Photo/video upload + moderation; gift shop, credits, points, inbox |
| 5 Mobile & production launch | **Outstanding** | Production-safety gating verified | Apps, push, licensed maps, store reviews, monitoring, backups, security test, rehearsal |

**Launch readiness (s30): NOT READY.** Mandatory items still open: age/identity verification, legal & insurance review, payment-provider approval, real payment/payout tests, production SMS/email tests, production maps, operational incident processes, migrations/backups/monitoring.

---

## 5. Test coverage against s28

| Area | Covered | Missing |
|---|---|---|
| Auth (28.4) | valid registration, invalid OTP, failed login, under-18 | expired OTP, lockout, password reset, suspended Mate access, failed age/ID checks (no vendor) |
| Booking (28.5) | request, availability refusal, acceptance, payment failure, completion, review, free meet | Mate decline, customer/Mate cancellation + refund, rescheduling (not built), partial group acceptance (unit only), dispute (not built) |
| Financial (28.3) | successful payment, failed payment, commission (unit), ledger export | refund E2E, payout, payout failure, duplicate webhook, reconciliation, disputes (all need Stripe) |
| Permissions | 5 staff roles + customer access to admin/export | per-action API tests for every permission |
| Production safety | env rules (unit), unsafe start refused (manual) | automated deployment check |

---

## 6. Changes since the previous roadmap (14 Nov 2026)

Added for SRS v1.3:

- 15 staff roles with a permission matrix and staff management.
- Staff two-step sign-in, and a signed-in devices list with revoke.
- Production-environment safety: unsafe production start refuses to boot; development providers refuse in production.
- Mate decisions with reasons, plus request-info, re-verify and restrict-service.
- Blocking.
- Mate weekly introduction limits.
- Free first meet as a $0 booking (30 min / 1 h / 2 h).
- Fixed travel charge, fixed booking fee and per-category commission.
- Ledger entries record the Mate, gross amount and commission.
- SOS and emergency contact.
- Restricted safety tickets, and v1.3 ticket categories.
- Analytics: commission, net revenue, cancellations by party, response and resolution times, safety incidents.
- Integration test-send.
- Media limits updated to v1.3.
- Travel switched off for the initial launch scope.
