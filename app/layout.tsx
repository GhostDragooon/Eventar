import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
   instance aliases the legacy var name --font-inter; globals.css defines
   --font-source-serif: var(--font-inter) so every existing Tailwind font
   utility keeps working with zero downstream edits. Geist is a variable
   font — omitting `weight` loads the full 100–900 axis (the redesign
   uses 400–800). */
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased light`}
    >
      <head>
        {/* Material Symbols Outlined — mockups use it inline throughout.
            Variable axes (wght, FILL) controlled via CSS in globals.css.
            eslint rule below is a false positive — this is the root layout,
            not a per-page font import. */}
        {/* display=block is deliberate for an ICON font: with swap, every
            icon flashes as its raw ligature text ("arrow_forward") until the
            font arrives — the classic weekend-project tell. A short blank is
            the correct trade for glyphs. */}
        {/* Preconnect to BOTH hosts. The stylesheet is on fonts.googleapis.com
            but the woff2 it points at is on fonts.gstatic.com, so without this
            the browser pays DNS + TCP + TLS twice, serially, before the first
            glyph can paint — and `display=block` means every icon is INVISIBLE
            for that entire window, not just unstyled.

            That is the "the dashboard reverted to the old design" report on
            2026-08-09: nav items, the date/time/venue row and the button
            glyphs all rendered as empty gaps on a cold load, which reads as a
            broken page rather than a loading one. crossOrigin is required on
            the gstatic hint — font fetches are CORS, and a preconnect without
            it opens a connection the font request cannot reuse. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font, @next/next/google-font-display */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=block"
        />
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
