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

// Returned by the Server Action. Never throws on user-recoverable errors —
// returns a typed result and lets the form render the friendly message.
export type RegisterResult =
  | { ok: true }
  | { error: string };
