import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Script from "next/script";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/textSize";
import { ToastProvider } from "@/components/ui/toast";
import { ReviewBanner } from "@/components/dev/ReviewBanner";

// FOUC prevention: runs synchronously before paint, applies the user's saved
// theme + text-size classes on <html>. Without this, the page would render
// in defaults for one frame and snap to the user's picks after React
// hydrates. The localStorage keys are shared with lib/theme.ts and
// lib/textSize.ts; keep the snippet minimal so it stays inline-able. Any
// failure (private mode, throwing storage) silently falls back to defaults
// — the missing classes are the default state.
const THEME_INIT_SCRIPT = [
  // The default is light, not system (M2 unfreeze): a dark-OS visitor with no
  // stored pick must still get the white app, so the absence of a pick has to
  // resolve to an explicit .light class rather than to "no class" (which the
  // prefers-color-scheme block in globals.css would then claim).
  //
  // <html> already ships class="light" from the server, so the common case —
  // no stored pick — needs no mutation at all and hydrates byte-identically.
  // This script only has work to do for a stored 'dark' or 'system' pick, and
  // in those two cases it must REMOVE the server's 'light' first.
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='dark'||t==='system'){var c=document.documentElement.classList;c.remove('light');if(t==='dark'){c.add('dark')}}}catch(e){}`,
  `try{var s=localStorage.getItem(${JSON.stringify(TEXT_SIZE_STORAGE_KEY)});if(s==='small'||s==='large'){document.documentElement.classList.add('text-'+s)}}catch(e){}`,
].join('');

/* Redesign (2026-06-11): single Geist family everywhere. The one sans
   instance aliases the legacy var name --font-inter. Geist is a variable
   font — omitting `weight` loads the full 100–900 axis (the redesign
   uses 400–800).
   NOTE: the claim below that --font-source-serif aliases --font-inter was
   true then, not now — the M2 unfreeze (see globals.css) gave it a real
   serif stack, then 2026-08-20 pointed --font-heading/-display/-headline-*
   at --font-inter directly instead of re-aliasing --font-source-serif
   itself. Headings ARE sans again; this comment's mechanism is just stale. */
const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

/* Material Symbols, SELF-HOSTED (2026-08-21).
   Was a <link> to fonts.googleapis.com. That stylesheet is unlayered, and
   unlayered author CSS outranks every author layer, so Google's own
   `.material-symbols-outlined { font-size: 24px }` silently overrode all 96
   `text-[Npx]` utilities on icon spans across 50 files — every icon in the app
   rendered 24px regardless of its declared size (measured, not inferred).
   Self-hosting removes that stylesheet from the page entirely, so the only
   rule naming this class is ours (globals.css), which deliberately sets no
   font-size and lets the utilities decide.

   NOT next/font/google: "Material Symbols Outlined" is absent from its
   catalogue (checked — 1911 fonts, zero matches), so next/font/local + a
   committed woff2 is the supported path.

   The file is the exact variable woff2 Google was already serving
   (wght 100..700, FILL 0..1, 1,126,804 bytes) — byte-for-byte what users
   downloaded before, just from our own origin, so this is not a new payload.
   Deliberately NOT subsetted via `icon_names=`: several call sites pick the
   glyph dynamically from data (`{p.icon}`, `{s.icon}`), so a subset silently
   degrades any icon a future data row names into raw ligature text.
   display:"block" is kept from the old link for the reason documented in
   <head> below — for an ICON font, a brief blank beats flashing the ligature
   text ("arrow_forward") on every glyph. */
const materialSymbols = localFont({
  src: "./fonts/MaterialSymbolsOutlined.woff2",
  variable: "--font-material-symbols",
  display: "block",
  weight: "100 700",
  style: "normal",
});

export const metadata: Metadata = {
  // Per-page titles compose through the template ("Dashboard · Eventar").
  title: { default: "Eventar", template: "%s · Eventar" },
  description:
    "Run workshops end to end — registration, reminder passes, on-site check-in, and post-event feedback in one loop.",
  applicationName: "Eventar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // "light" is rendered server-side because light IS the default (M2
      // unfreeze) — that way the overwhelmingly common case (no stored pick)
      // matches what the pre-paint script leaves on the element, so there is
      // nothing to hydrate-mismatch. suppressHydrationWarning covers the two
      // cases that legitimately differ by design: a stored 'dark' pick (script
      // swaps light→dark) and a stored 'system' pick (script strips light so
      // the prefers-color-scheme block can apply). The server cannot know
      // either — localStorage is client-only — so the difference is intended,
      // not a bug, and this is the documented React escape hatch for it.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${materialSymbols.variable} h-full antialiased light`}
    >
      <head>
        {/* Material Symbols is SELF-HOSTED as of 2026-08-21 — see the
            `materialSymbols` localFont() call above for why, and globals.css
            for the class that consumes it.

            The <link rel="stylesheet"> to fonts.googleapis.com and BOTH
            preconnect hints that used to live here are gone on purpose: there
            is no third-party font request left to warm up a connection for.
            That also retires, rather than reintroduces, the cold-load hazard
            they existed to mitigate (the "dashboard reverted to the old
            design" report, 2026-08-09 — glyphs invisible while two serial
            DNS+TCP+TLS handshakes completed, made worse by display:block).
            Next now emits its own same-origin <link rel="preload"> for the
            woff2, so the font is discovered earlier than it ever was, with
            zero cross-origin round trips. Do not "restore" the preconnects;
            they would open connections nothing uses. */}
        {/* Theme-class init: applies the saved .light/.dark class on <html>
            before paint so there's no flash of system-default. Hardcoded
            string (no user input) — safe. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col font-body-md" suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
        {/* Renders nothing unless the local review bypass is engaged. */}
        <ReviewBanner />
      </body>
    </html>
  );
}
