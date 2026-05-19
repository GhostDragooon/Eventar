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
        <p className="text-gray-700">
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
        <p className="font-medium text-green-700">✓ You&apos;re registered!</p>
        <p className="text-sm text-gray-700 mt-2">
          We&apos;ll email a confirmation to <strong>{state.email}</strong> shortly.
        </p>
        <p className="text-xs text-gray-500 mt-2">
          (Phase 7 will make this real; for now, the server logged the would-send.)
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
      <h2 className="font-medium text-gray-900">Register for this event</h2>
      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block">
          <span className="block text-sm font-medium mb-1 text-gray-900">Full name</span>
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
          <span className="block text-sm font-medium mb-1 text-gray-900">Email</span>
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
          <p className="text-sm text-red-700">⚠ {errorMessage}</p>
        )}

        <div className="flex justify-end pt-1">
          <Button type="submit" disabled={isSubmitting || !name.trim() || !email.trim()}>
            {isSubmitting ? 'Registering…' : 'Register'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6">
      {children}
    </section>
  );
}
