import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { signOut } from "./auth-actions";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  title: "HIRE A MATE: Your Mate. Your Time. Your Choice.",
  description:
    "Find company for life and practical help at home. Platonic companionship, activities and everyday assistance across Australia.",
};

const NAV: [string, string][] = [
  ["/find", "Find a Mate"],
  ["/find?kind=HOUSEHOLD", "Home help"],
  ["/groups", "Group Experiences"],
  ["/how-it-works", "How It Works"],
  ["/safety", "Safety"],
  ["/help", "Help"],
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null, archived: false } }) : 0;
  const dash = user?.role === "MATE" ? "/mate" : user?.role === "ADMIN" ? "/admin" : "/bookings";
  const dashLabel = user?.role === "MATE" ? "Mate dashboard" : user?.role === "ADMIN" ? "Admin" : "My bookings";
  return (
    <html lang="en-AU">
      <body className={`${jakarta.variable} font-sans antialiased`}>
        <header className="sticky top-0 z-[1000] border-b border-ocean/10 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-extrabold tracking-tight text-ocean">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-coral text-xs text-ocean-700">HM</span>
              <span className="hidden sm:inline">HIRE A MATE</span>
            </Link>
            <nav className="hidden flex-1 gap-5 text-sm font-medium text-muted lg:flex">
              {NAV.map(([href, label]) => (
                <Link key={href} href={href} className="hover:text-ocean">{label}</Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-sm">
              {user ? (
                <>
                  <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-ocean-100" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                    <span aria-hidden>🔔</span>
                    {unread > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-ocean-700">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    )}
                  </Link>
                  <Link href={dash} className="btn-ghost">{dashLabel}</Link>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-full px-2 py-1 text-muted hover:text-ocean">{user.displayName} ▾</summary>
                    <div className="absolute right-0 mt-2 w-48 rounded-xl border border-ocean/10 bg-white p-2 shadow-lg">
                      {[["/account", "Account & settings"], ["/membership", "Membership"], ["/help", "Help & support"]].map(([h, l]) => (
                        <Link key={h} href={h} className="block rounded-lg px-3 py-2 hover:bg-ivory">{l}</Link>
                      ))}
                      <form action={signOut}><button className="w-full rounded-lg px-3 py-2 text-left hover:bg-ivory">Sign out</button></form>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  <Link href="/signin" className="btn-ghost">Sign in</Link>
                  <Link href="/register" className="btn-ocean">Join</Link>
                </>
              )}
            </div>
          </div>
          <nav className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm font-medium text-muted lg:hidden">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="whitespace-nowrap hover:text-ocean">{label}</Link>
            ))}
          </nav>
        </header>
        <main className="min-h-[70vh]">{children}</main>
        <footer className="mt-16 bg-ocean text-ocean-100">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
            <div>
              <p className="font-bold text-white">HIRE A MATE</p>
              <p className="mt-1">Nobody should miss out on life because they have nobody to go with.</p>
            </div>
            <div>
              <p>Platonic companionship, activities and non-regulated everyday help only.</p>
              <p className="mt-1">Not a dating, escort, counselling, medical, NDIS or aged-care service.</p>
            </div>
            <div className="flex flex-col gap-1">
              <Link href="/safety" className="hover:text-white">Safety &amp; community policy</Link>
              <Link href="/how-it-works" className="hover:text-white">How it works</Link>
              <Link href="/register?role=MATE" className="hover:text-white">Become a Mate</Link>
              <Link href="/help" className="hover:text-white">Help centre</Link>
              <span>Prices in AUD · 18+ only</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
