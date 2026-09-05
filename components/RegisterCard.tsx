'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { registerForEvent } from '@/app/(public)/events/[id]/actions';
import type { EmailDelivery } from '@/app/(public)/events/[id]/schema';
import type { Lifecycle } from '@/lib/lifecycle/eventLifecycle';
import { DevEmailStubStrip } from '@/components/dev/DevEmailStubBanner';

type Props = {
  eventId: string;
  maxAttendees: number | null;
  currentCount: number;       // count of existing registrations
  lifecycle: Lifecycle;       // form shows only while 'registering'
  /**
   * False when RESEND_API_KEY is unset — the send seam lands on devEmailStub
   * and no real inbox is touched. The success block renders a stub-mode strip
   * when this is false so the visitor sees the honest state (playbook item 3).
   * Server-computed by the parent; boolean-only so the key value never reaches
   * the client (CLAUDE.md rule 10).
   */
  deliveryLive: boolean;
  /**
   * Signed-in visitor's name (preferred_name || full_name). Prefills the name
   * field. Editable so a shared-inbox signer can register a colleague; the
   * server-side email-match guard drops user_id attachment when the submitted
   * email doesn't match the session's, so this remains safe.
   */
  defaultName?: string;
  /**
   * Signed-in visitor's email. Prefills the email field. Editable for the
   * same reason as defaultName.
   */
  defaultEmail?: string;
  /**
   * When set, the visitor is signed OUT and a nudge renders above the form
   * ("Sign in first to link this registration"). Href is the round-trip URL
   * back to this event page via /account/sign-in.
   */
  signInHref?: string;
  /**
   * Count of guest registrations matching the signed-in visitor's email that
   * remain unlinked. > 0 renders a compact "we found N" line pointing at
   * /account/claim — closes the walk-in flow's discovery beat for visitors
   * who round-tripped back to the event page instead of landing on /account.
   */
  unlinkedRegistrationsCount?: number;
  /**
   * Whether the visitor is signed in. Dedicated boolean (not derived from
   * `defaultEmail !== undefined`) because deriving from a proxy field is the
   * "control one layer above where the write happens" pattern — a phone-auth
   * or email-less signed-in user has no email to prefill, but is still
   * signed in, and every attribution/discovery branch should honour that.
   * Producer (page) owns the truth; consumer (this component) reads it
   * directly. Second-pass review MODERATE 5.
   */
  signedIn?: boolean;
};

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; email: string; emailDelivery: EmailDelivery }
  | { kind: 'error'; message: string };

export default function RegisterCard({
  eventId,
  maxAttendees,
  currentCount,
  lifecycle,
  deliveryLive,
  defaultName,
  defaultEmail,
  signInHref,
  unlinkedRegistrationsCount = 0,
  signedIn = false,
}: Props) {
  const [name, setName] = useState(defaultName ?? '');
  const [email, setEmail] = useState(defaultEmail ?? '');
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
  // component) → Email delivery-honest sentence → Pass-later note → Fine print.
  // Pre-2026-08-27 this block claimed "a confirmation has been sent" regardless
  // of what actually happened, and gestured at scanning "the QR code" — but
  // Email #1 carries no QR (that is Email #2, the pass, which arrives closer to
  // the event). Both lies fixed together per playbook items 1 + 2.
  if (state.kind === 'success') {
    const deliveryCopy = successDeliveryCopy(state.emailDelivery, state.email);
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
            {deliveryCopy}
          </p>
          {/* Item 2: pass timing. The check-in QR + manual code live on Email
              #2, which fires ~60 min before start — not in the confirmation. */}
          <p className="font-body-md text-body-md text-on-surface m-0">
            Closer to the event we&apos;ll email your personal check-in pass.
          </p>
        </div>
        {/* Item 3: inline dev-stub marker in the success block. Rendered here
            only when the parent tells us delivery is stubbed; the same strip
            appears at the top of the operator dashboard. */}
        {!deliveryLive && <DevEmailStubStrip />}
        {/* Cancel fine print: only mention "reply to your confirmation email"
            when a confirmation email was actually accepted by the provider.
            In the queued_dev (stub) and failed branches, no email reached the
            attendee, so directing them at a non-existent inbox is the same
            class of rule-12 lie the primary copy fix just closed. */}
        <p className="font-body-md text-[calc(12px*var(--text-scale))] text-on-surface-variant m-0">
          {state.emailDelivery === 'sent'
            ? 'Need to cancel? Reply to your confirmation email.'
            : 'Need to cancel? See event staff at check-in — this browser tab is your proof of registration.'}
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
        setState({
          kind: 'success',
          email: email.trim().toLowerCase(),
          emailDelivery: res.emailDelivery,
        });
      }
    });
  }

  const isSubmitting = state.kind === 'submitting';
  const errorMessage = state.kind === 'error' ? state.message : null;

  // ─── States 1, 2, 4: Initial / Submitting / Error ─────────────────────
  return (
    <Section>
      <h2 className="font-title-lg text-title-lg text-on-surface m-0">Register</h2>
      {/* Walk-in flow nudge (signed-out only). Copy is honest for both CPD
          and non-CPD events — "release CME/CPD points for accredited events"
          scopes the promise to the case where it matters, so a general
          audience is not misled. Same banner shape as the pending-credit
          banner on /checkin/confirm for tone continuity. */}
      {signInHref && (
        <p
          className="font-body-md text-body-md text-on-surface-variant bg-surface-container border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>account_circle</span>
          <span className="flex-1">
            <Link href={signInHref} className="text-primary-ink hover:underline font-semibold">
              Sign in or sign up first
            </Link>{' '}
            to link this registration to your account — required to release CME/CPD points for accredited events.
          </span>
        </p>
      )}
      {/* Signed-in attribution line: makes the prefill visible so a
          shared-inbox signer registering a colleague notices the defaults
          before they submit. Belt to the server-side email-match guard's
          braces — the guard drops user_id when the email doesn't match, but
          it cannot catch "signed-in Bob submits his own email meaning to
          register Alice" (user-lens IMPORTANT 3).
          Binds to CURRENT state, not defaults — a stale label showing the
          defaults after the user has edited is the same failure class as
          the guard-above-the-write pattern (label one layer above where
          the actual value lives). "Not you?" prompt fires only while the
          form still matches the pre-filled defaults; once edited, the
          factual "Registering as X" remains but the prompt drops. */}
      {signedIn && (name || email) && (
        <p className="font-body-md text-body-md text-on-surface-variant m-0">
          Registering as{' '}
          <span className="text-on-surface font-semibold">
            {name || email}
          </span>
          {name && email ? ` · ${email}` : ''}
          {name === (defaultName ?? '') && email === (defaultEmail ?? '')
            ? ' — not you? Edit the fields below.'
            : ''}
        </p>
      )}
      {/* Discovery beat for the round-tripped visitor: /account's banner is
          not visible to a walk-in who came from an event page and landed
          back on it after OTP. Surfacing the count here closes that gap
          (user-lens IMPORTANT 2). */}
      {signedIn && unlinkedRegistrationsCount > 0 && (
        <p
          role="status"
          className="font-body-md text-body-md text-on-surface-variant bg-primary-fixed border border-outline-variant rounded-lg px-md py-sm flex items-start gap-sm m-0"
        >
          <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>link</span>
          <span className="flex-1">
            We noticed{' '}
            {unlinkedRegistrationsCount === 1
              ? '1 earlier registration'
              : `${unlinkedRegistrationsCount} earlier registrations`}{' '}
            under this email that aren&apos;t linked to your account yet.{' '}
            <Link href="/account" className="text-primary-ink hover:underline font-semibold">
              Link {unlinkedRegistrationsCount === 1 ? 'it' : 'them'}
            </Link>
            .
          </span>
        </p>
      )}
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

/**
 * Success-block sentence per emailDelivery branch (playbook item 1).
 * Verbatim from Eventar_Demo_Diagnose_and_Optimize.txt §2.1(1):
 *   sent    → "A confirmation has been sent to …"
 *   queued_dev → "You're registered. Email delivery is in dev mode — check the operator console."
 *   failed  → "You're registered. We couldn't send email; show this screen to staff."
 * The email string is a JSX fragment only for the `sent` branch (it renders
 * `<strong>{email}</strong>` inline); the other two never name the recipient,
 * matching the playbook copy exactly.
 */
function successDeliveryCopy(emailDelivery: EmailDelivery, email: string): React.ReactNode {
  if (emailDelivery === 'sent') {
    return (
      <>
        A confirmation has been sent to <strong>{email}</strong>.
      </>
    );
  }
  if (emailDelivery === 'queued_dev') {
    return "You're registered. Email delivery is in dev mode — check the operator console.";
  }
  // failed
  return "You're registered. We couldn't send email; show this screen to staff.";
}
