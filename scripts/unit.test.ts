import { test } from "node:test";
import assert from "node:assert/strict";
import { screenText } from "../src/lib/policy";
import { estimateTaskHours, priceBooking, mateNetCents } from "../src/lib/pricing";
import { deriveStatus } from "../src/lib/status";
import { haversineKm, travelFeeCents, coarse } from "../src/lib/geo";
import { parseLocal } from "../src/lib/format";
import { ageOn, normaliseAuMobile, passwordProblem, maskEmail, maskMobile } from "../src/lib/identity";

test("policy blocks sexual / intimate requests", () => {
  for (const t of ["looking for intimacy after dinner", "can you send nudes", "girlfriend experience please", "massage at my hotel", "pretend to be my girlfriend at the wedding"])
    assert.equal(screenText(t).ok, false, t);
});

test("policy allows ordinary requests", () => {
  for (const t of ["Dinner at a Thai place then a comedy show", "Clean kitchen and bathroom, cook dinner for 2", "Wedding reception in Carlton, smart casual", "Walk around the botanic gardens at a slow pace"])
    assert.equal(screenText(t).ok, true, t);
});

test("policy blocks off-platform contact details", () => {
  assert.equal(screenText("call me on 0412 345 678").ok, false);
  assert.equal(screenText("email me at a@b.com").ok, false);
});

test("multi-task estimate rounds up to half hours with a minimum", () => {
  assert.equal(estimateTaskHours([60, 45, 60, 90]), 4.5);
  assert.equal(estimateTaskHours([20], 1), 1);
});

test("pricing: fee on service time only, travel passed through", () => {
  const p = priceBooking(2, [{ id: "m", displayName: "M", hourlyRateCents: 4500 }], 0.05, 1200);
  assert.equal(p.subtotalCents, 9000);
  assert.equal(p.customerFeeCents, 450);
  assert.equal(p.travelFeeCents, 1200);
  assert.equal(p.totalCents, 10650);
  assert.deepEqual(mateNetCents(9000, 0.15), { gross: 9000, commission: 1350, net: 7650 });
});

test("partial acceptance status", () => {
  assert.equal(deriveStatus(["PENDING", "PENDING"]), "PENDING_MATE_ACCEPTANCE");
  assert.equal(deriveStatus(["ACCEPTED", "PENDING"]), "PARTIALLY_ACCEPTED");
  assert.equal(deriveStatus(["ACCEPTED", "ACCEPTED"]), "CONFIRMED");
  assert.equal(deriveStatus(["DECLINED", "DECLINED"]), "CANCELLED");
});

test("geo: haversine and travel fee", () => {
  const sydney = { lat: -33.8688, lng: 151.2093 };
  const parramatta = { lat: -33.815, lng: 151.0011 };
  const d = haversineKm(sydney, parramatta);
  assert.ok(d > 19 && d < 21, `got ${d}`);
  assert.equal(travelFeeCents(null, 80, 500), 0);
  assert.equal(travelFeeCents(3, 80, 500), 500); // minimum applies
  assert.equal(travelFeeCents(20, 80, 500), 1600);
  assert.equal(travelFeeCents(20, 0, 0), 0);
  assert.equal(coarse(-33.86882), -33.87);
});

test("parseLocal converts Sydney wall-clock time to UTC across DST", () => {
  assert.equal(parseLocal("2026-11-20", "18:00").toISOString(), "2026-11-20T07:00:00.000Z"); // AEDT +11
  assert.equal(parseLocal("2026-07-20", "18:00").toISOString(), "2026-07-20T08:00:00.000Z"); // AEST +10
});

test("identity helpers", () => {
  assert.equal(normaliseAuMobile("0412 345 678"), "+61412345678");
  assert.equal(normaliseAuMobile("+61 412 345 678"), "+61412345678");
  assert.equal(normaliseAuMobile("02 9999 9999"), null);
  assert.equal(ageOn(new Date("2008-11-14T00:00:00Z"), new Date("2026-11-13T00:00:00Z")), 17);
  assert.equal(ageOn(new Date("2008-11-14T00:00:00Z"), new Date("2026-11-14T00:00:00Z")), 18);
  assert.equal(passwordProblem("short1", 10)?.includes("10"), true);
  assert.equal(passwordProblem("onlyletterslong", 10)?.includes("numbers"), true);
  assert.equal(passwordProblem("GoodPassw0rd", 10), null);
  assert.equal(maskEmail("alex@example.com"), "al•••@example.com");
  assert.equal(maskMobile("+61412345678"), "+6141•••678");
});

import { ROLE_PERMISSIONS, can } from "../src/lib/permissions";
import { configProblems, devFeaturesEnabled } from "../src/server/env";

test("RBAC: least privilege per role (SRS v1.3 s4.3)", () => {
  const staff = (r: keyof typeof ROLE_PERMISSIONS) => ({ role: "ADMIN", staffRole: r });
  assert.equal(Object.keys(ROLE_PERMISSIONS).length, 15);
  assert.equal(can(staff("SUPER_ADMIN"), "staff.manage"), true);
  assert.equal(can(staff("GENERAL_MANAGER"), "staff.manage"), false);
  assert.equal(can(staff("CUSTOMER_SUPPORT"), "support.manage"), true);
  assert.equal(can(staff("CUSTOMER_SUPPORT"), "safety.manage"), false);
  assert.equal(can(staff("CUSTOMER_SUPPORT"), "finance.export"), false);
  assert.equal(can(staff("FINANCE_OFFICER"), "finance.export"), true);
  assert.equal(can(staff("FINANCE_OFFICER"), "mates.review"), false);
  assert.equal(can(staff("VERIFICATION_OFFICER"), "mates.verify"), true);
  assert.equal(can(staff("MATE_RECRUITMENT_OFFICER"), "mates.verify"), false);
  assert.equal(can({ role: "ADMIN", staffRole: null }, "analytics.view"), false); // staff without a role: nothing
  assert.equal(can({ role: "CUSTOMER", staffRole: "SUPER_ADMIN" }, "analytics.view"), false); // role must be ADMIN
  assert.equal(can(null, "analytics.view"), false);
});

test("production safety (SRS v1.3 s27)", () => {
  const env = process.env as Record<string, string | undefined>;
  const saved = { ...env };
  try {
    env.NODE_ENV = "production"; delete env.HAM_ENV; env.ALLOW_DEMO_LOGIN = "true"; delete env.AUTH_SECRET; env.APP_URL = "http://x";
    assert.equal(devFeaturesEnabled(), false); // demo flag ignored in production
    const p = configProblems();
    assert.ok(p.some((x) => x.includes("AUTH_SECRET")));
    assert.ok(p.some((x) => x.includes("ALLOW_DEMO_LOGIN")));
    assert.ok(p.some((x) => x.includes("https")));
    env.NODE_ENV = "development"; delete env.ALLOW_DEMO_LOGIN;
    assert.equal(devFeaturesEnabled(), false); // absent flag never enables dev features
    env.ALLOW_DEMO_LOGIN = "true";
    assert.equal(devFeaturesEnabled(), true);
  } finally {
    for (const k of Object.keys(env)) delete env[k];
    Object.assign(env, saved);
  }
});
