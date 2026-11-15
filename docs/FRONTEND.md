# Frontend

HIRE A MATE is a single Next.js 15 app (App Router). The frontend and backend live in the same project.
Pages are **React Server Components** by default and read the database directly on the server. Interactive
parts are small **client components** (`"use client"`), and forms call **server actions** instead of a REST API.
See [BACKEND.md](BACKEND.md) for the server side.

**Tech:** Next.js 15.5 · React 19 · TypeScript · Tailwind CSS v4 · Leaflet / react-leaflet (maps)

## Folder map

```
src/
├── app/                      # Routes (one folder = one URL). page.tsx = the page, layout.tsx = shared shell
│   ├── layout.tsx            # Root shell: header, nav, footer, fonts, brand theme
│   ├── globals.css           # Tailwind v4 theme tokens (@theme) and utilities (.card, .btn, .input, .chip…)
│   ├── page.tsx              # Home: "What do you need today?" picker, categories, featured Mates
│   ├── find/                 # Search Mates: filters, near-me radius, list + map view
│   ├── mates/[id]/           # Public Mate profile: services, reviews, favourite, introduce, book
│   ├── book/[mateId]/        # Booking request form (?freeMeet= for a free first meet)
│   ├── bookings/             # Customer & Mate booking list
│   │   └── [id]/             # Booking detail: status, chat, payment panel, SOS, review, ledger
│   ├── register/  verify/    # Sign-up (18+ check) and email/mobile code verification
│   ├── signin/               # Password sign-in (+ demo accounts in development)
│   │   ├── code/             # Sign in with a one-time code
│   │   └── 2fa/              # Staff second step (SMS code)
│   ├── account/              # Preferences, emergency contact, devices, blocks, saved places, favourites
│   ├── notifications/        # In-app notification centre
│   ├── membership/           # Plans and subscription
│   ├── introductions/[id]/   # Introduction chat before a booking
│   ├── help/                 # Help centre and support tickets (help/tickets/[id])
│   ├── groups/               # Group activities
│   ├── safety/ how-it-works/ report/   # Information and reporting pages
│   ├── mate/                 # Mate dashboard
│   │   ├── profile/          # Mate profile editor (services, area, rates, rules)
│   │   └── calendar/         # Availability windows
│   ├── admin/                # Staff console (nav filtered by role permissions)
│   │   ├── page.tsx          # Analytics dashboard
│   │   ├── mates/            # Mate review and decisions
│   │   ├── support/          # Support and safety tickets
│   │   ├── catalogue/        # Categories, services, needs, restricted tasks
│   │   ├── membership/       # Plans
│   │   ├── comms/            # Templates and delivery log
│   │   ├── settings/         # Platform settings, integrations, test-send
│   │   ├── staff/            # Staff accounts and roles
│   │   ├── audit/            # Audit log
│   │   └── export/route.ts   # CSV export (bookings / transactions)
│   └── dev/inbox/            # DEVELOPMENT ONLY: captured emails/SMS. Disabled in production
└── components/               # Reusable UI
    ├── ui.tsx                # PageHeader, badges, stars, empty states and other primitives
    ├── NeedPicker.tsx        # Home "need" chooser (stays in the browser, never sent to the server)
    ├── BookingForm.tsx       # Booking request form with live price and travel charge
    ├── PaymentPanel.tsx      # Pay step for PENDING_PAYMENT bookings
    ├── StatefulForm.tsx      # Form wrapper that keeps input after an error (React 19 safe)
    ├── ReportFields.tsx      # Report / safety form fields
    ├── LocationFields.tsx    # Suburb picker + "use my location"
    ├── MateMap.tsx / MapView.tsx   # Leaflet map (client-only, suburb-centre pins)
```

## How a page works

1. `page.tsx` is an async server component. It calls `requireUser()` / `requirePermission()` from
   `src/lib/session.ts` when the page needs sign-in, then loads data with Prisma (`src/lib/db.ts`).
2. It renders HTML on the server. No data-fetching API is exposed to the browser.
3. Forms post to a **server action** (`src/app/*-actions.ts`). The action validates with zod, checks
   permissions, writes to the database, then calls `revalidatePath()` so the page re-renders with fresh data.
4. Client components are used only where the browser is needed: maps, the need picker, live price
   calculation, and forms that must keep their input after a validation error.

## Forms (React 19)

React 19 resets a form after its action runs. To keep what the user typed when there's an error, forms
submit manually: `onSubmit` → `preventDefault()` → `startTransition(() => formAction(formData))`.
`StatefulForm.tsx` wraps this pattern; use it for new forms.

## Styling and brand

Tailwind v4 with theme tokens in `src/app/globals.css`:

| Token | Colour | Use |
|---|---|---|
| `ocean` | #123B5D Ocean Blue | Headings, primary buttons, nav |
| `coral` | #F28C6B Warm Coral | Calls to action, highlights, alerts |
| `ivory` | #F5F2EC Warm Ivory | Page background |
| `white` | #FFFFFF | Cards |

Shared classes: `.card`, `.btn`, `.btn-coral`, `.input`, `.label`, `.chip`, `.h1`, `.h2`. Layouts are
mobile-first and tested at phone width (Playwright mobile project).

## Privacy rules the UI must keep

- The home "What do you need today?" choice is kept in the browser only.
- Public pages never show legal name, date of birth, email or mobile.
- Mates are shown on the map at their **suburb centre**, never an address.
- A household address is shown to a Mate only after they accept the booking.
- Development pages (`/dev/inbox`, demo sign-in buttons) only render when `devFeaturesEnabled()` is true,
  which is never the case in production.

## Adding a page

1. Create `src/app/<route>/page.tsx` (server component).
2. Guard it: `await requireUser()` or `await requirePermission("perm.name")`.
3. Put mutations in a server action in the matching `*-actions.ts` file; don't add API routes for forms.
4. Reuse `components/ui.tsx` primitives and the theme classes.
5. Add an E2E check in `e2e/` if it's part of a user journey.
