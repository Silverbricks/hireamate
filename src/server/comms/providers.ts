import "server-only";

// Provider adapters (v1.2 s2.1, 3.1, 17). Business logic only calls these interfaces, so a
// provider can be switched from Admin → Integrations without code changes.
// Secrets come from environment variables only; nothing secret is stored in the DB.

export type SendResult = { ref?: string };
export interface EmailProvider { name: string; requiredEnv: string[]; send(m: { to: string; subject: string; text: string; html: string }): Promise<SendResult> }
export interface SmsProvider { name: string; requiredEnv: string[]; send(m: { to: string; body: string; senderId?: string }): Promise<SendResult> }
export interface PushProvider { name: string; requiredEnv: string[]; send(m: { userId: string; title: string; body: string; link?: string }): Promise<SendResult> }

/** Development provider: nothing leaves the server; messages are visible in the delivery log and /dev/inbox. */
const consoleEmail: EmailProvider = {
  name: "console", requiredEnv: [],
  async send(m) { console.info(`[email:console] to=${m.to} subject="${m.subject}"`); return { ref: `console-${Date.now()}` }; },
};
const consoleSms: SmsProvider = {
  name: "console", requiredEnv: [],
  async send(m) { console.info(`[sms:console] to=${m.to} body="${m.body}"`); return { ref: `console-${Date.now()}` }; },
};
const consolePush: PushProvider = {
  name: "console", requiredEnv: [],
  async send(m) { console.info(`[push:console] user=${m.userId} title="${m.title}"`); return { ref: `console-${Date.now()}` }; },
};

// Resend: https://resend.com/docs/api-reference/emails/send-email
const resend: EmailProvider = {
  name: "resend", requiredEnv: ["RESEND_API_KEY", "EMAIL_FROM"],
  async send(m) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { id?: string };
    return { ref: json.id };
  },
};

// Twilio Programmable Messaging: https://www.twilio.com/docs/messaging/api/message-resource#create-a-message-resource
const twilio: SmsProvider = {
  name: "twilio", requiredEnv: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"],
  async send(m) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: m.to, From: m.senderId || process.env.TWILIO_FROM!, Body: m.body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = (await res.json()) as { sid?: string };
    return { ref: json.sid };
  },
};

export const EMAIL_PROVIDERS: Record<string, EmailProvider> = { console: consoleEmail, resend };
export const SMS_PROVIDERS: Record<string, SmsProvider> = { console: consoleSms, twilio };
// Mobile push (FCM) arrives with the mobile apps; web/in-app notifications work today.
export const PUSH_PROVIDERS: Record<string, PushProvider> = { console: consolePush };

export function missingEnv(p: { requiredEnv: string[] }) {
  return p.requiredEnv.filter((k) => !process.env[k]);
}
