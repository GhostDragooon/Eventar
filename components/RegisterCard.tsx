'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { registerForEvent } from '@/app/(public)/events/[id]/actions';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';

type Props = {
  eventId: string;
  maxAttendees: number | null;
  currentCount: number;       // count of existing registrations
  lifecycle: Lifecycle;       // form shows only while 'registering'
};

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; email: string }
  | { kind: 'error'; message: string };

export default function RegisterCard({ eventId, maxAttendees, currentCount, lifecycle }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const atCapacity = maxAttendees !== null && currentCount >= maxAttendees;

  // ─── State 6: Registration window closed (form layer of the 3-layer
  // rule — the Server Action enforces the same boundary authoritatively).
  // Checked before capacity: "ended/closed" is the truer reason than "full".
  // `live` gets its own copy: walk-ups scanning the venue poster in the
  // 60-min check-in window are the most common visitors of this state, and
  // "closed" alone is a dead end for them — point them to staff instead.
  if (lifecycle !== 'registering') {
    const { title, body } =
      lifecycle === 'completed'
        ? { title: 'Event ended', body: 'This event has already ended.' }
        : lifecycle === 'live'
          ? {
              title: 'Event in progress',
              body: 'Registration has closed. If you’re at the venue, please see the event staff at check-in.',
            }
          : { title: 'Registration closed', body: 'Registration for this event has closed.' };
    return (
      <Section>
        <h2 className="font-title-lg text-title-lg text-on-surface m-0">{title}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">{body}</p>
      </Section>
    );
  }

  // ─── State 5: At-capacity (form disabled, message replaces it) ────────
  if (atCapacity) {
    return (
      <Section>
        <h2 className="font-title-lg text-title-lg text-on-surface m-0">At capacity</h2>
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          This event is at capacity ({currentCount}/{maxAttendees} registered).
          Future events will open registration soon.
        </p>
      </Section>
    );
  }

  // ─── State 3: Success (PR — post-register) ────────────────────────────
  // §4 IA order: Pill → Hero → (Event card lives on the page above this
  // component) → Email confirm → Reg code → CTA → Fine print.
  // §3 sentence stack: each sentence its own <p>, gap-0 so line-height (1.6)
  // is the sole rhythm authority between lines.
  if (state.kind === 'success') {
    return (
      <Section>
        <span className="font-label-md text-label-md px-sm py-xs rounded-full uppercase inline-flex items-center gap-sm bg-success-container text-on-success-container border border-transparent self-start">
          <span className="material-symbols-outlined text-[calc(14px*var(--text-scale))]" data-fill="1" aria-hidden>check_circle</span>
          You&apos;re registered
        </span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface m-0">
          See you on the day
        </h2>
        <div className="flex flex-col gap-0">
          <p className="font-body-md text-body-md text-on-surface m-0">
            A confirmation has been sent to <strong>{state.email}</strong>.
          </p>
          <p className="font-body-md text-body-md text-on-surface m-0">
            Please scan the QR code at the counter on the day.
          </p>
          <p className="font-body-md text-body-md text-on-surface m-0">
            Alternatively, you may present the code below for manual check-in.
          </p>
        </div>
        <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant m-0">
          Need to cancel? Reply to your confirmation email.
        </p>
      </Section>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'submitting' });
    startTransition(async () => {
      const res = await registerForEvent({ event_id: eventId, full_name: name, email });
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
      } else {
        setState({ kind: 'success', email: email.trim().toLowerCase() });
      }
    });
  }

  const isSubmitting = state.kind === 'submitting';
  const errorMessage = state.kind === 'error' ? state.message : null;

  // ─── States 1, 2, 4: Initial / Submitting / Error ─────────────────────
  return (
    <Section>
      <h2 className="font-title-lg text-title-lg text-on-surface m-0">Register</h2>
      <form className="flex flex-col gap-md" onSubmit={onSubmit}>
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface uppercase tracking-wider mb-xs">
            Full name
          </span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            placeholder="Your name"
            disabled={isSubmitting}
          />
        </label>
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface uppercase tracking-wider mb-xs">
            Email
          </span>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            disabled={isSubmitting}
          />
        </label>

        {errorMessage && (
          <p
            role="alert"
            className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
          >
            <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
              warning
            </span>
            <span>{errorMessage}</span>
          </p>
        )}

        <Button
          type="submit"
          disabled={isSubmitting || !name.trim() || !email.trim()}
          className="w-full"
        >
          {isSubmitting ? 'Registering…' : 'Register'}
        </Button>
      </form>
    </Section>
  );
}

// Section wrapper for the register surface. The page already runs the §5
// equal-gap container; this just supplies a single rhythm beat between the
// section's heading and its body. NO border, NO background — the surface
// flows with the page, not against it.
function Section({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-md">{children}</section>;
}
