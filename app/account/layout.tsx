// Attendee /account tree layout — the single gate that keeps organiser
// sessions out of the attendee routes. Runs before every /account/* page,
// including /account/sign-in and /account/sign-up.
//
// Ivan's 2026-09-24 restatement of Q32: organisers own the organiser side,
// they have no attendee identity by design. A staff session hitting any
// /account/* route is a persona crossover, not a broken practitioner —
// redirect them to /dashboard (their real home) rather than letting the
// page render the practitioner surface for them.
//
// The individual /account/* pages stay dumb about this — they can keep
// treating "signed in" as "candidate practitioner" because this layout has
// already filtered out the staff case. Note this is UI/routing framing,
// not authorization (RLS still gates every write); pages that also need to
// enforce something for security must not rely on this layout.

import { redirect } from 'next/navigation';
import { isStaffSession } from '@/lib/auth';

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  if (await isStaffSession()) {
    redirect('/dashboard');
  }
  return children;
}
