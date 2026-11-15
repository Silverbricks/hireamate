// Smoke test: every page renders for the right role, and private data never leaks.
// Usage: npm run build && npx next start, then: node scripts/smoke.mjs
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = new PrismaClient();
const alex = await db.user.findUniqueOrThrow({ where: { email: "alex@customers.example" } });
const grace = await db.user.findUniqueOrThrow({ where: { email: "grace@mates.example" }, include: { mateProfile: true } });
const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@hireamate.example" } });
const sam = await db.user.findUniqueOrThrow({ where: { email: "sam@customers.example" } });
const alexBooking = await db.booking.findFirstOrThrow({ where: { customerId: alex.id } });
// Real sessions: store the hash, send the raw token as the cookie.
const tokens = new Map();
for (const u of [alex, grace, admin, sam]) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { id: createHash("sha256").update(token).digest("hex"), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) } });
  tokens.set(u.id, token);
}
await db.$disconnect();

let failures = 0;
async function check(path, { as, expect = [], forbid = [], status = 200 } = {}) {
  const res = await fetch(BASE + path, { headers: as ? { cookie: `ham_session=${tokens.get(as.id)}` } : {}, redirect: "manual" });
  const html = await res.text();
  const problems = [];
  if (res.status !== status) problems.push(`status ${res.status} != ${status}`);
  for (const e of expect) if (!html.includes(e)) problems.push(`missing "${e}"`);
  for (const f of forbid) if (html.includes(f)) problems.push(`leaked "${f}"`);
  console.log(`${problems.length ? "FAIL" : "ok  "} ${path}${as ? ` [${as.displayName}]` : ""} ${problems.join("; ")}`);
  failures += problems.length ? 1 : 0;
}

const legal = ["Example</", "Grace Example", "grace@mates.example", "1992-"];
await check("/", { expect: ["What do you need today?", "I need help cleaning my home", "Short-Term Companion"] });
await check("/find", { expect: ["Find a Mate", "Sponsored"] });
await check("/find?kind=HOUSEHOLD", { expect: ["Grace", "Insured"] });
await check("/find?category=cooking-meals&service=weekly-meal-prep", { expect: ["Hannah"] });
await check(`/mates/${grace.mateProfile.id}`, { expect: ["Household skills", "Kitchen cleaning"], forbid: legal });
await check(`/book/${grace.mateProfile.id}`, { as: alex, expect: ["Community policy", "Add more tasks", "Childcare"] });
await check(`/book/${grace.mateProfile.id}`, { expect: ["Sign in to book"] });
await check("/bookings", { as: alex, expect: ["Hi Alex"] });
await check(`/bookings/${alexBooking.id}`, { as: alex, expect: ["Messages"] });
await check(`/bookings/${alexBooking.id}`, { as: sam, status: 404 }); // other customers can't see it
await check("/bookings", { status: 307 }); // signed out -> redirect
await check("/mate", { as: grace, expect: ["Earnings", "New booking requests"] });
await check("/admin/catalogue", { as: admin, expect: ["Restricted task register", "Cleaning &amp; Housekeeping"] });
await check("/admin", { as: alex, status: 307 }); // customers can't open admin
await check("/groups", { expect: ["Board game night"] });
await check("/safety", { expect: ["Strictly non-sexual"] });
await check("/how-it-works", { expect: ["Becoming a Mate"] });
await check("/signin", { expect: ["Sign in"] });
await check("/register", { expect: ["Create your account"] });
await check("/help", { expect: ["Help &amp; support"] });
await check("/account", { as: alex, expect: ["Notification preferences", "Saved locations"], forbid: ["Alex Customer"] });
await check("/membership", { as: alex, expect: ["Customer Plus"] });
await check("/notifications", { as: alex, expect: ["Notifications"] });
await check("/mate/calendar", { as: grace, expect: ["Weekly availability"] });
await check("/mate/profile", { as: grace, expect: ["Service suburb"] });
for (const p of ["/admin", "/admin/mates", "/admin/settings", "/admin/comms", "/admin/membership", "/admin/support", "/admin/audit", "/admin/catalogue"]) await check(p, { as: admin });
await check("/find?near=Penrith&view=map", { expect: ["Penrith NSW 2750", "leaflet"].slice(0, 1) });

console.log(failures ? `\n${failures} check(s) failed` : "\nAll smoke checks passed");
process.exit(failures ? 1 : 0);
