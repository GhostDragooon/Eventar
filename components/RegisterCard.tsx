'use client';

import { useState, useTransition } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { registerForEvent } from '@/app/(public)/events/[id]/actions';

type Props = {
  eventId: string;
  maxAttendees: number | null;
  currentCount: number;       // count of existing registrations
};

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; email: string }
  | { kind: 'error'; message: string };

export default function RegisterCard({ eventId, maxAttendees, currentCount }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<FormState>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  const atCapacity = maxAttendees !== null && currentCount >= maxAttendees;

  // ─── State 5: At-capacity (form disabled, message replaces it) ────────
  if (atCapacity) {
    return (
      <Card>
        <div className="flex items-center gap-md mb-sm">
          <div className="w-10 h-10 rounded-full bg-error-container text-on-error-container flex items-center justify-center" aria-hidden>
            <span className="material-symbols-outlined text-[20px]">event_busy</span>
          </div>
          <h2 className="font-headline-sm text-[20px] text-on-surface">At capacity</h2>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant">
          This event is at capacity ({currentCount}/{maxAttendees} registered).
          Future events will open registration soon.
        </p>
      </Card>
    );
  }

  // ─── State 3: Success (form swaps to confirmation) ────────────────────
  if (state.kind === 'success') {
    return (
      <Card>
        <div className="flex items-center gap-md mb-sm">
          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center" aria-hidden>
            <span className="material-symbols-outlined text-[20px]" data-fill="1">check_circle</span>
          </div>
          <h2 className="font-headline-sm text-[20px] text-on-surface">You&apos;re registered!</h2>
        </div>
        <p className="font-body-md text-body-md text-on-surface">
          We&apos;ll email a confirmation to <strong>{state.email}</strong> shortly.
        </p>
      </Card>
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
    <Card>
      <div className="flex items-center gap-md mb-md">
        <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center" aria-hidden>
          <span className="material-symbols-outlined text-[20px]">edit_note</span>
        </div>
        <div>
          <h2 className="font-headline-sm text-[20px] text-on-surface">Register</h2>
          <p className="font-body-md text-[12px] text-on-surface-variant">
            Free. Takes 30 seconds.
          </p>
        </div>
      </div>
      <form className="space-y-md" onSubmit={onSubmit}>
        <label className="block">
          <span className="block font-label-md text-label-md text-on-surface uppercase mb-xs">
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
          <span className="block font-label-md text-label-md text-on-surface uppercase mb-xs">
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
            <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>
              warning
            </span>
            <span>{errorMessage}</span>
          </p>
        )}

        <div className="flex justify-end pt-xs">
          <Button
            type="submit"
            disabled={isSubmitting || !name.trim() || !email.trim()}
            className="min-w-32"
          >
            {isSubmitting ? 'Registering…' : 'Register'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm">
      {children}
    </section>
  );
}
