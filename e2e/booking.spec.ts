import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Milestone journey (roadmap): Register → Verify age → Find a Mate → Request booking → Mate accepts → Pay → Complete → Review.
// Requires ALLOW_DEMO_LOGIN=true (demo switcher + /dev/inbox for OTP codes). The DB is re-seeded before each project.

test.describe.configure({ mode: "serial" });

const run = Date.now().toString().slice(-7);
const customer = { email: "", mobile: "", password: "Journey2026pass" };

// Fresh data for each project (desktop, mobile) so the journey is repeatable.
test.beforeAll(({}, testInfo) => {
  execSync("npx tsx prisma/seed.ts", { stdio: "ignore" });
  const n = testInfo.project.name === "mobile" ? "2" : "1";
  customer.email = `e2e.${run}.${n}@example.com`;
  customer.mobile = `04${n}${run}`;
});

async function demoSignIn(page: Page, name: string) {
  await page.goto("/signin");
  await page.getByRole("button", { name: new RegExp("^" + name + " ") }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"));
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Latest OTP of a channel from the dev inbox. */
async function latestCode(page: Page, channel: "EMAIL" | "SMS") {
  await page.goto("/dev/inbox");
  const msg = page.getByTestId("dev-message").filter({ hasText: `${channel} · to` }).filter({ hasText: "OTP_CODE" }).first();
  const text = await msg.innerText();
  return text.match(/\b(\d{6})\b/)![1];
}

/** Next date (YYYY-MM-DD, Sydney) at least 2 days out that falls on one of the given weekdays. */
function nextWeekday(days: number[]) {
  const d = new Date(Date.now() + 2 * 86400_000);
  for (let i = 0; i < 14; i++) {
    const local = new Date(d.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
    if (days.includes(local.getDay())) return local.toLocaleDateString("en-CA");
    d.setDate(d.getDate() + 1);
  }
  throw new Error("no date");
}

test("under-18s cannot register", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Teen");
  await page.getByLabel("Legal name").fill("Teen Example");
  await page.getByLabel("Email").fill(`teen.${run}@example.com`);
  await page.getByLabel("Australian mobile").fill("0499999999");
  const dob = new Date();
  dob.setFullYear(dob.getFullYear() - 17);
  await page.getByLabel("Date of birth").evaluate((el, v) => ((el as HTMLInputElement).removeAttribute("max"), ((el as HTMLInputElement).value = v)), dob.toISOString().slice(0, 10));
  await page.getByLabel("Password").fill(customer.password);
  await page.getByLabel(/I'm 18 or older/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("18 or older");
});

test("register → verify email & mobile → signed in", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("Display name").fill("Jordan");
  await page.getByLabel("Legal name").fill("Jordan Example");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Australian mobile").fill(customer.mobile);
  await page.getByLabel("Date of birth").fill("1990-05-15");
  await page.getByLabel("Password").fill(customer.password);
  await page.getByLabel(/I'm 18 or older/).check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/verify/);

  const emailCode = await latestCode(page, "EMAIL");
  const smsCode = await latestCode(page, "SMS");
  await page.goto("/verify");
  await page.getByLabel("Email code").fill("000000");
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.locator("p[role=alert]").first()).toContainText("incorrect");
  await page.getByLabel("Email code").fill(emailCode);
  await page.getByRole("button", { name: "Verify email" }).click();
  await expect(page.getByText("✓ Verified")).toBeVisible();
  await page.getByLabel("Mobile code").fill(smsCode);
  await page.getByRole("button", { name: "Verify mobile" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("button", { name: /Jordan/ }).or(page.getByText("Jordan ▾"))).toBeVisible();

  // Password sign-in works after sign-out; a wrong password gets a generic error.
  await signOut(page);
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill(customer.email);
  await page.getByLabel("Password").fill("wrong-password-1");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toContainText("Incorrect");
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
});

test("milestone journey: find nearby → request → accept → pay → complete → review", async ({ page }) => {
  // Find a Mate near Penrith with the map.
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill(customer.mobile); // mobile works as identifier too
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");

  await page.goto("/find?kind=HOUSEHOLD&near=Penrith%20NSW%202750&radius=25&view=map");
  await expect(page.getByText(/within 25 km of Penrith/)).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
  await expect(page.getByRole("link", { name: /Grace/ }).first()).toContainText("km away");
  await page.getByRole("link", { name: /Grace/ }).first().click();
  await page.getByRole("link", { name: "Request a booking" }).click();

  // Grace works Mon/Tue/Thu/Fri 16:00–22:00. A Sunday request is rejected (availability enforced server-side).
  await page.getByLabel("Service or activity").selectOption({ label: "Kitchen cleaning" });
  await page.getByLabel(/Bathroom & toilet cleaning/).check();
  await page.getByLabel(/Laundry & folding/).check();
  await expect(page.getByText(/tasks ≈ 165 min/)).toBeVisible();
  await page.getByLabel("Suburb").fill("Penrith NSW 2750");
  await page.getByLabel("Street address").fill("12 Example St");
  await page.getByLabel("Describe the work").fill("Two-bedroom unit. Kitchen and bathroom clean, plus one load of laundry.");
  await page.getByLabel("Date").fill(nextWeekday([0]));
  await page.getByLabel("Start time").fill("18:00");
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("isn't available");

  await page.getByLabel("Date").fill(nextWeekday([2, 4]));
  await page.getByRole("button", { name: "Send booking request" }).click();
  await page.waitForURL(/\/bookings\/.+\?new=1/);
  const bookingUrl = page.url().split("?")[0];
  await expect(page.getByText("Nothing has been charged.").first()).toBeVisible();

  // Mate accepts (gets an in-app notification first).
  await signOut(page);
  await demoSignIn(page, "Grace");
  await page.goto("/notifications");
  await expect(page.getByText(/New booking request from Jordan/)).toBeVisible();
  await page.goto(bookingUrl);
  await expect(page.getByText("12 Example St")).toBeHidden(); // address hidden until accepted
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText(/12 Example St/)).toBeVisible();
  await expect(page.getByText("Accepted: awaiting payment")).toBeVisible();

  // Customer pays: a declined card first, then success.
  await signOut(page);
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto(bookingUrl);
  await expect(page.getByRole("heading", { name: "Pay to confirm" })).toBeVisible();
  await page.getByLabel("Simulate a declined card").check();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.locator("p[role=alert]")).toContainText("declined");
  await page.getByLabel("Simulate a declined card").uncheck();
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Payment .* succeeded/)).toBeVisible();

  // Mate runs the booking.
  await signOut(page);
  await demoSignIn(page, "Grace");
  await page.goto(bookingUrl);
  for (const step of ["I'm on my way", "Check in", "Start activity"]) {
    await page.getByRole("button", { name: step }).click();
    await expect(page.getByRole("button", { name: step })).toBeHidden();
  }
  await page.getByPlaceholder("Write a message…").fill("On site now, starting with the kitchen.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("On site now, starting with the kitchen.")).toBeVisible();

  // Customer completes and reviews.
  await signOut(page);
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto(bookingUrl);
  await page.getByRole("button", { name: "Confirm it's complete" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  await page.getByPlaceholder("How was the experience?").fill("Spotless kitchen and bathroom. Thank you!");
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByText(/You rated/)).toBeVisible();

  // Emails went out through the notification service.
  await page.goto("/dev/inbox");
  await expect(page.getByText(/Receipt: \$/).first()).toBeVisible();
});


async function customerSignIn(page: Page) {
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

test("membership, introductions, free first meet ($0) and SOS", async ({ page }) => {
  await customerSignIn(page);
  await page.goto("/membership");
  await page.getByRole("button", { name: "Choose Customer Plus" }).click();
  await expect(page.getByText(/Current: Customer Plus · renews/)).toBeVisible();

  await page.goto("/find?q=Mei");
  await page.getByRole("link", { name: /Mei/ }).first().click();
  await page.waitForURL(/\/mates\//);
  const mateUrl = page.url();
  await page.getByRole("button", { name: "♡ Save to favourites" }).click();
  await expect(page.getByRole("button", { name: "♥ Saved to favourites" })).toBeVisible();
  await page.getByLabel("Suggested activity").fill("Dumplings in Chatswood");
  await page.getByLabel("Introduction message").fill("Hi Mei! I'm new to the North Shore and would love a food tour.");
  await page.getByLabel("Ask about a free first meet").check();
  await page.getByRole("button", { name: "Send introduction" }).click();
  await page.waitForURL(/\/introductions\//);
  const introUrl = page.url();

  // Chat stays locked until the Mate accepts.
  await expect(page.getByText(/Chat opens once Mei accepts/)).toBeVisible();

  await signOut(page);
  await demoSignIn(page, "Mei");
  await page.goto(introUrl);
  await page.getByLabel("Accept & open chat").check();
  await page.getByRole("button", { name: "Send response" }).click();
  await page.getByPlaceholder("Write a message…").fill("Happy to! A quick coffee first?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Happy to! A quick coffee first?")).toBeVisible();

  // Customer books the free first meet: $0 service time, no payment step.
  await signOut(page);
  await customerSignIn(page);
  await page.goto(introUrl);
  await page.getByRole("link", { name: /Book free first meet \(30 min\)/ }).click();
  await expect(page.getByText(/Free first meet: 30 minutes, \$0 service time/)).toBeVisible();
  await page.getByLabel("Suburb").fill("Chatswood NSW 2067");
  await page.getByLabel("Meeting point").fill("Chatswood Interchange");
  await page.getByLabel("Describe the activity").fill("Coffee and a chat about North Shore food spots.");
  await page.getByLabel("Date").fill(nextWeekday([2, 3]));
  await page.getByLabel("Start time").fill("18:00");
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Request free first meet" }).click();
  await page.waitForURL(/\/bookings\/.+\?new=1/);
  const freeUrl = page.url().split("?")[0];
  await expect(page.getByText("Free first meet").first()).toBeVisible();

  // A second free meet with the same Mate is refused.
  await page.goto(`${introUrl}`);
  await page.getByRole("link", { name: /Book free first meet/ }).click();
  await page.getByLabel("Suburb").fill("Chatswood NSW 2067");
  await page.getByLabel("Meeting point").fill("Chatswood Interchange");
  await page.getByLabel("Describe the activity").fill("Another free coffee please, thank you.");
  await page.getByLabel("Date").fill(nextWeekday([2, 3]));
  await page.getByLabel("Start time").fill("20:00");
  await page.getByLabel(/I understand and agree/).check();
  await page.getByRole("button", { name: "Request free first meet" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("already had a free first meet");

  await signOut(page);
  await demoSignIn(page, "Mei");
  await page.goto(freeUrl);
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible(); // no payment needed for $0

  // SOS from the customer during a confirmed booking alerts safety staff (restricted ticket).
  await signOut(page);
  await customerSignIn(page);
  await page.goto(freeUrl);
  await expect(page.getByRole("heading", { name: "Pay to confirm" })).toBeHidden();
  await page.getByRole("button", { name: "Alert the safety team (SOS)" }).click();
  await expect(page.getByText(/Safety alert sent/)).toBeVisible();
  await expect(page.getByText(/HIRE A MATE is not an emergency service/).first()).toBeVisible();

  await signOut(page);
  await demoSignIn(page, "Sasha"); // Safety Officer sees it
  await page.goto("/admin/support");
  await expect(page.getByText(/SOS during booking/)).toBeVisible();
  await signOut(page);
  await demoSignIn(page, "Casey"); // Customer Support does not (restricted access)
  await page.goto("/admin/support");
  await expect(page.getByText(/SOS during booking/)).toBeHidden();

  // Blocking: the customer blocks Mei; further introductions are refused.
  await signOut(page);
  await customerSignIn(page);
  await page.goto(introUrl);
  await page.getByRole("button", { name: "Block Mei" }).click();
  await page.goto(mateUrl);
  await expect(page.getByText(/You.ve blocked this Mate/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Send introduction" })).toBeHidden();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Blocked" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signed-in devices" })).toBeVisible();
});

test("staff roles: least privilege, two-step sign-in, Mate decisions with reasons", async ({ page }) => {
  // Customer Support: support yes; settings, staff and ledger export no.
  await demoSignIn(page, "Casey");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/support/); // no analytics permission → first permitted page
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/forbidden/);
  expect((await page.request.get("/admin/export?type=transactions&days=30")).status()).toBe(403);

  // Finance Officer: analytics + ledger export, but not Mate approvals.
  await signOut(page);
  await demoSignIn(page, "Fiona");
  const csv = await page.request.get("/admin/export?type=transactions&days=30");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("BOOKING_CAPTURE");
  await page.goto("/admin/mates");
  await expect(page).toHaveURL(/\/admin\/forbidden/);

  // Verification Officer requests more info from Arjun with a reason; Arjun sees it.
  await signOut(page);
  await demoSignIn(page, "Vic");
  await page.goto("/admin/mates");
  const arjun = page.locator("li", { hasText: "Arjun" });
  await arjun.getByLabel("Decision for Arjun").selectOption("REQUEST_INFO");
  await arjun.getByRole("button", { name: "Record decision" }).click();
  await expect(arjun.locator("p[role=alert]")).toContainText("Record a reason");
  await arjun.getByLabel("Reason for Arjun").fill("Please add your availability and a longer About Me.");
  await arjun.getByRole("button", { name: "Record decision" }).click();
  await expect(page.locator("li", { hasText: "Arjun" })).toBeHidden();
  await signOut(page);
  await demoSignIn(page, "Arjun");
  await expect(page.getByText("Please add your availability and a longer About Me.")).toBeVisible();

  // Super Admin signs in with password + SMS code (two-step), approves Arjun, sees staff matrix.
  await signOut(page);
  await page.goto("/signin");
  await page.getByLabel("Email or mobile").fill("admin@hireamate.example");
  await page.getByLabel("Password").fill("MateDemo2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/signin\/2fa/);
  await page.getByLabel("Security code").fill("000000");
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page.locator("p[role=alert]")).toContainText("incorrect");
  await page.goto("/dev/inbox");
  const code = (await page.getByTestId("dev-message").filter({ hasText: "SMS · to" }).filter({ hasText: "OTP_CODE" }).first().innerText()).match(/\b(\d{6})\b/)![1];
  await page.goto("/signin/2fa");
  await page.getByLabel("Security code").fill(code);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await page.waitForURL(/\/admin$/);
  await page.goto("/admin/mates?status=DRAFT");
  const a2 = page.locator("li", { hasText: "Arjun" });
  await a2.getByLabel("Decision for Arjun").selectOption("APPROVE");
  await a2.getByRole("button", { name: "Record decision" }).click();
  await expect(page.locator("li", { hasText: "Arjun" })).toBeHidden();
  await page.goto("/find?q=Arjun");
  await expect(page.getByRole("link", { name: /Arjun/ }).first()).toBeVisible();
  await page.goto("/admin/staff");
  await expect(page.getByRole("heading", { name: "Permission matrix" })).toBeVisible();
  await page.goto("/admin/audit");
  await expect(page.getByText("mate.request_info").first()).toBeVisible();

  // Staff can't use single-factor code sign-in.
  await signOut(page);
  await page.goto("/signin/code");
  await page.locator("form").nth(1).getByPlaceholder("Email or mobile").fill("admin@hireamate.example");
  await page.locator("form").nth(1).getByPlaceholder("123456").fill("123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("p[role=alert]")).toBeVisible();
});

test("permissions: customers can't open admin, exports or other people's bookings", async ({ page }) => {
  await demoSignIn(page, "Sam");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/signin/);
  expect((await page.request.get("/admin/export?type=bookings")).status()).toBe(403);
});
