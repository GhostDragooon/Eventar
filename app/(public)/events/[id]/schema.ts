import { z } from 'zod';

// Email regex: matches the validator we use elsewhere (login/actions.ts).
// Single @, no whitespace, at least one dot in the domain part.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const registrationInputSchema = z.object({
  event_id:  z.string().uuid(),
  full_name: z.string().trim().min(1, 'Name required').max(100, 'Name too long'),
  email:     z.string().trim().toLowerCase().regex(EMAIL_RE, 'Invalid email'),
});

export type RegistrationInput = z.infer<typeof registrationInputSchema>;

/**
 * Send outcome for the confirmation email, threaded through so the success UI
 * can tell the honest story. `sent` = Resend accepted; `queued_dev` = local dev
 * stub swallowed it (RESEND_API_KEY unset); `failed` = provider rejected or
 * threw. Registration ALWAYS succeeds regardless of this field — attendance is
 * the authoritative ledger, and the email is a courtesy on top. Aligns naming
 * with the cron dispatch's `delivery: 'live' | 'stubbed'` and PassDeliveryPanel's
 * `deliveryLive` prop.
 */
export type EmailDelivery = 'sent' | 'queued_dev' | 'failed';

// Returned by the Server Action. Never throws on user-recoverable errors —
// returns a typed result and lets the form render the friendly message.
export type RegisterResult =
  | { ok: true; emailDelivery: EmailDelivery }
  | { error: string };
