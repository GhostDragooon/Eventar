import { notFound } from 'next/navigation';

// Design sandbox for eyeballing UI-port components in local dev only. These
// pages render real auth and staff UI (a working magic-link form, sign-out),
// so production builds must never serve them (Ivan, 2026-10-14: gate, don't
// delete).
export default function DevPreviewLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return children;
}
