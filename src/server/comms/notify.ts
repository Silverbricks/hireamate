import "server-only";
import type { Channel } from "@prisma/client";
import { db } from "@/lib/db";
import { DEV_ONLY_PROVIDERS, isProduction } from "../env";
import { maskEmail, maskMobile } from "../auth";
import { CATEGORIES, EVENTS, render, type EventKey } from "./events";
import { EMAIL_PROVIDERS, PUSH_PROVIDERS, SMS_PROVIDERS, missingEnv } from "./providers";

type Vars = Record<string, string | number>;

async function activeProvider(kind: "EMAIL" | "SMS" | "PUSH") {
  const row = await db.integrationSetting.findUnique({ where: { kind } });
  const table = kind === "EMAIL" ? EMAIL_PROVIDERS : kind === "SMS" ? SMS_PROVIDERS : PUSH_PROVIDERS;
  const p = table[row?.provider ?? "console"] ?? table.console;
  return { provider: p, config: (row?.config ?? {}) as Record<string, string> };
}

function inQuietHours(user: { quietStartMin: number | null; quietEndMin: number | null; timezone: string }) {
  if (user.quietStartMin == null || user.quietEndMin == null) return false;
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone: user.timezone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date());
  const now = Number(parts.find((p) => p.type === "hour")!.value) * 60 + Number(parts.find((p) => p.type === "minute")!.value);
  const { quietStartMin: s, quietEndMin: e } = user;
  return s <= e ? now >= s && now < e : now >= s || now < e; // window may cross midnight
}

/** Sends one message on one channel and records it in the delivery log. Never throws. */
async function deliver(opts: {
  channel: Exclude<Channel, "IN_APP">; event: string; userId?: string; to: string; subject?: string; text: string; html?: string;
}) {
  const kind = opts.channel;
  const { provider, config } = await activeProvider(kind);
  const masked = kind === "EMAIL" ? maskEmail(opts.to) : kind === "SMS" ? maskMobile(opts.to) : opts.to;
  // One-time codes are only kept in the log for the local console provider (dev inbox); real providers get a redacted log.
  const logBody = opts.event === "OTP_CODE" && provider.name !== "console" ? opts.text.replace(/\b\d{6}\b/g, "••••••") : opts.text;
  const log = await db.deliveryLog.create({
    data: { userId: opts.userId, channel: kind, event: opts.event, provider: provider.name, to: masked, subject: opts.subject, body: logBody, status: "QUEUED" },
  });
  if (DEV_ONLY_PROVIDERS.has(provider.name) && isProduction()) {
    await db.deliveryLog.update({ where: { id: log.id }, data: { status: "FAILED", error: "Development provider is disabled in production. Configure a real provider." } });
    return;
  }
  const missing = missingEnv(provider);
  if (missing.length) {
    await db.deliveryLog.update({ where: { id: log.id }, data: { status: "FAILED", error: `Provider not configured: missing ${missing.join(", ")}` } });
    return;
  }
  try {
    const r =
      kind === "EMAIL"
        ? await EMAIL_PROVIDERS[provider.name].send({ to: opts.to, subject: opts.subject ?? "", text: opts.text, html: opts.html ?? opts.text })
        : kind === "SMS"
          ? await SMS_PROVIDERS[provider.name].send({ to: opts.to, body: opts.text, senderId: config.senderId })
          : await PUSH_PROVIDERS[provider.name].send({ userId: opts.to, title: opts.subject ?? "", body: opts.text });
    await db.deliveryLog.update({ where: { id: log.id }, data: { status: "SENT", attempts: 1, providerRef: r.ref } });
  } catch (e) {
    await db.deliveryLog.update({ where: { id: log.id }, data: { status: "FAILED", attempts: 1, error: String(e).slice(0, 500) } });
  }
}

async function template(channel: Channel, event: string, locale: string) {
  return (
    (await db.messageTemplate.findFirst({ where: { channel, event, locale, active: true } })) ??
    (await db.messageTemplate.findFirst({ where: { channel, event, locale: "en-AU", active: true } }))
  );
}

function emailHtml(bodyText: string) {
  const paras = bodyText.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#1d2733">
<div style="background:#123b5d;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-weight:800">HIRE A MATE</div>
<div style="background:#fff;border:1px solid #e5e1d8;border-top:0;padding:20px;border-radius:0 0 12px 12px">${paras}</div>
<p style="font-size:12px;color:#5b6672;text-align:center">Platonic companionship and everyday help · Manage notifications in Settings</p></div>`;
}

/**
 * Central notification entry point (v1.2 s4). Creates the in-app notification, then sends
 * email / SMS / push where a template exists, the user's preferences allow it and quiet hours
 * don't apply. Essential categories ignore preferences and quiet hours.
 */
export async function notify(userId: string, event: EventKey, vars: Vars = {}) {
  try {
    const def = EVENTS[event];
    const essential = CATEGORIES[def.category].essential;
    const user = await db.user.findUnique({ where: { id: userId }, include: { notifPrefs: true } });
    if (!user || user.status !== "ACTIVE") return;
    const pref = user.notifPrefs.find((p) => p.category === def.category);
    const quiet = !essential && inQuietHours(user);
    const link = "link" in def && def.link ? render(def.link, vars) : undefined;
    const fullVars = { name: user.displayName, ...vars, link: link ? `${process.env.APP_URL ?? "http://localhost:3000"}${link}` : "" };

    await db.notification.create({
      data: { userId, event, category: def.category, title: render(def.title, vars), body: "", link },
    });

    const channels: { ch: Exclude<Channel, "IN_APP">; allowed: boolean; to: string | null }[] = [
      { ch: "EMAIL", allowed: essential || (pref?.email ?? true), to: user.emailVerifiedAt || event === "OTP_CODE" ? user.email : null },
      { ch: "SMS", allowed: essential || ((pref?.sms ?? true) && !quiet), to: user.mobileVerifiedAt ? user.mobile : null },
      { ch: "PUSH", allowed: essential || ((pref?.push ?? true) && !quiet), to: user.id },
    ];
    for (const c of channels) {
      if (!c.allowed || !c.to) continue;
      const t = await template(c.ch, event, user.locale);
      if (!t) continue;
      const text = render(t.body, fullVars);
      await deliver({
        channel: c.ch, event, userId, to: c.to, text,
        subject: t.subject ? render(t.subject, fullVars) : undefined,
        html: c.ch === "EMAIL" ? emailHtml(render(t.body, fullVars, true)) : undefined,
      });
    }
  } catch (e) {
    console.error("notify failed", event, e); // notifications must never break the action that triggered them
  }
}

/** OTP delivery to an address that may not belong to a verified user yet (registration, sign-in). */
export async function sendOtp(channel: "EMAIL" | "SMS", to: string, code: string, userId?: string) {
  const event = "OTP_CODE";
  const t = await template(channel, event, "en-AU");
  const vars = { code, minutes: 10 };
  const text = t ? render(t.body, vars) : `Your HIRE A MATE code is ${code}. It expires in 10 minutes. Never share it.`;
  await deliver({
    channel, event, userId, to, text,
    subject: channel === "EMAIL" ? (t?.subject ? render(t.subject, vars) : "Your HIRE A MATE code") : undefined,
    html: channel === "EMAIL" ? emailHtml(text) : undefined,
  });
}

/** Direct SMS to a number that isn't a platform user (emergency contact). Logged like any delivery. */
export async function sendSms(to: string, text: string, userId: string, event: string) {
  await deliver({ channel: "SMS", event, userId, to, text });
}

/** Integration "test connection" (SRS v1.3 s17.5): sends a real message through the active provider and logs it. */
export async function sendTest(channel: "EMAIL" | "SMS", to: string, userId: string) {
  if (!to) return;
  const text = "HIRE A MATE integration test. If you received this, the provider is working.";
  await deliver({ channel, event: "INTEGRATION_TEST", userId, to, text, subject: channel === "EMAIL" ? "HIRE A MATE integration test" : undefined, html: channel === "EMAIL" ? emailHtml(text) : undefined });
}

/** Admin retry of a failed delivery (v1.2 s2.3). Only non-OTP messages are retried; codes must be re-requested. */
export async function retryDelivery(logId: string) {
  const log = await db.deliveryLog.findUnique({ where: { id: logId } });
  if (!log || log.status !== "FAILED" || log.event === "OTP_CODE" || !log.userId || log.channel === "IN_APP") return false;
  const user = await db.user.findUnique({ where: { id: log.userId } });
  if (!user) return false;
  const to = log.channel === "EMAIL" ? user.email : log.channel === "SMS" ? user.mobile : user.id;
  if (!to) return false;
  await db.deliveryLog.update({ where: { id: log.id }, data: { status: "SKIPPED", error: `${log.error ?? ""} (retried)` } });
  await deliver({ channel: log.channel, event: log.event, userId: user.id, to, subject: log.subject ?? undefined, text: log.body, html: log.channel === "EMAIL" ? emailHtml(log.body) : undefined });
  return true;
}
