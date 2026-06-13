import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import { TEXT_SIZE_STORAGE_KEY } from "@/lib/textSize";

// FOUC prevention: runs synchronously before paint, applies the user's saved
// theme + text-size classes on <html>. Without this, the page would render
// in defaults for one frame and snap to the user's picks after React
// hydrates. The localStorage keys are shared with lib/theme.ts and
// lib/textSize.ts; keep the snippet minimal so it stays inline-able. Any
// failure (private mode, throwing storage) silently falls back to defaults
// — the missing classes are the default state.
const THEME_INIT_SCRIPT = [
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==='light'||t==='dark'){document.documentElement.classList.add(t)}}catch(e){}`,
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
  title: "Eventar",
  description: "Internal workshop manager — registration, reminders, on-site check-in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* Material Symbols Outlined — mockups use it inline throughout.
            Variable axes (wght, FILL) controlled via CSS in globals.css.
            eslint rule below is a false positive — this is the root layout,
            not a per-page font import. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
        />
        {/* Theme-class init: applies the saved .light/.dark class on <html>
            before paint so there's no flash of system-default. Hardcoded
            string (no user input) — safe. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col font-body-md" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
