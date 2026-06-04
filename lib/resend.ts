import 'server-only';
import { Resend } from 'resend';

export type SendEmailResult =
  | { ok: true; id: string }
  | { error: { code: string; message: string } };

const DEFAULT_FROM = 'Eventar <onboarding@resend.dev>';

/**
 * Production Resend client + facade.
 *
 * Reads RESEND_API_KEY lazily per call (env mutations in test work
 * naturally; production behaviour unchanged at the cost of one env lookup).
 * Reads RESEND_FROM_EMAIL with a sandbox default — override via env once
 * a custom domain is verified on Resend.
 *
 * Returns a tagged union. Never throws on Resend-side errors (those become
 * { error }); throws only on missing env config (production misconfig
 * must surface — CLAUDE.md Rule 12).
 *
 * No PII in returned error: the recipient address goes to Resend
 * (necessarily) but is never echoed back into the result or logged here.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      'RESEND_API_KEY is required — set it in .env.local before sending email. ' +
        'See docs/plans/2026-06-04-phase-7-resend-design.md.',
    );
  }
  const from = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    });

    if (error) {
      // Resend SDK returns { error } for API-side failures (4xx/5xx).
      // Map to our typed shape; both code + message are safe (no PII).
      const err = error as { name?: string; message?: string };
      return {
        error: {
          code: err.name ?? 'unknown_error',
          message: err.message ?? 'send failed',
        },
      };
    }

    return { ok: true, id: data?.id ?? '' };
  } catch (e) {
    // Network / connection errors throw from the SDK. Capture and map.
    const err = e as { code?: string; name?: string; message?: string };
    return {
      error: {
        code: err.code ?? err.name ?? 'unknown_error',
        message: err.message ?? 'unknown error',
      },
    };
  }
}
