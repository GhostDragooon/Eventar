# Phase 7 — Resend Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the `console.log` email stub at `registerForEvent` step 6 with a production Resend integration, while keeping dev testing possible (and the temp removable in 3 minutes) before credentials arrive.

**Architecture:** Two-file separation — `lib/resend.ts` is the production facade calling the real Resend SDK; `lib/devEmailStub.ts` is a parallel, marked-for-removal stub. An env-driven switch inside `registerForEvent` picks between them per call. `emails/confirmation.tsx` is a pure-presentation React Email template that pre-formatted props pass through. Removal cost is the design metric — see design doc §"Removal protocol."

**Tech Stack:**
- `resend` (Resend Node SDK, v6.x as of 2026-06-04)
- `@react-email/components` (table-based email JSX components)
- `@react-email/render` (async JSX-to-HTML render)
- Vitest (test runner; mocks via `vi.mock`)
- Next 16 + Supabase (existing project stack)

**Design reference:** `docs/plans/2026-06-04-phase-7-resend-design.md` (commit `fc938e5`)

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Add the three new runtime deps**

Run:
```bash
cd /Users/ivan/Eventar && pnpm add resend @react-email/components @react-email/render
```

Expected: pnpm resolves the deps, adds to `dependencies`, updates lockfile. Output ends with `Done in <Xs>`.

**Step 2: Verify package.json reflects the additions**

Run:
```bash
cd /Users/ivan/Eventar && grep -E '(resend|@react-email)' package.json
```

Expected output:
```
    "@react-email/components": "^...",
    "@react-email/render": "^...",
    "resend": "^...",
```

(Exact versions depend on what pnpm resolves at install time — don't pin specifically; just verify all 3 names appear.)

**Step 3: Confirm tsc still passes (no version mismatch)**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit
```

Expected: empty output (exit 0).

**Step 4: Commit**

```bash
cd /Users/ivan/Eventar && git add package.json pnpm-lock.yaml && git commit -m "$(cat <<'EOF'
chore(deps): add resend + @react-email packages for Phase 7

resend: production email SDK.
@react-email/components: JSX components rendering to email-safe HTML.
@react-email/render: async JSX-to-HTML for the dispatch pipeline.

No code changes in this commit — wiring lands in subsequent tasks per
docs/plans/2026-06-04-phase-7-resend.md.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: lib/devEmailStub.ts (the deletable stub)

**Why this first:** it has zero SDK dependencies, so it's simplest. Establishes the result-shape contract that the real facade will mirror.

**Files:**
- Create: `lib/devEmailStub.ts`
- Create: `lib/devEmailStub.test.ts`

**Step 1: Write the failing test**

Create `lib/devEmailStub.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
// devEmailStub uses `import 'server-only'`, same neutralisation as auth.test.ts.
vi.mock('server-only', () => ({}));

import { sendEmail } from './devEmailStub';

describe('devEmailStub.sendEmail', () => {
  it('returns { skipped: true } without performing a real send', async () => {
    // eslint-disable-next-line no-console
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await sendEmail({
      to: 'alice@example.com',
      subject: 'Test',
      html: '<p>hi</p>',
    });

    expect(result).toEqual({ skipped: true });

    // CLAUDE.md Rule 10: no PII in logs. The recipient email must NOT appear
    // in the console output. The stub logs that something would be sent but
    // doesn't reveal the recipient.
    const allLogs = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(allLogs).not.toContain('alice@example.com');

    logSpy.mockRestore();
  });
});
```

**Step 2: Run test to verify it fails (module not found)**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run lib/devEmailStub.test.ts 2>&1 | tail -20
```

Expected: FAIL with message like `Failed to resolve import "./devEmailStub"` or similar module-not-found error.

**Step 3: Implement the stub**

Create `lib/devEmailStub.ts`:

```ts
// ⚠️ DEV STUB — testing/dev convenience only.
//
// REMOVE THIS FILE once RESEND_API_KEY is set in .env.local:
//   See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol"
//
// No grep hunt required. The removal is a localized operation:
//   1. delete this file + its .test.ts
//   2. drop the `sendEmailStub` import in app/(public)/events/[id]/actions.ts
//   3. delete the env-switch line + the `{ skipped }` branch in the result handler
//   4. drop the "uses stub" test case in actions.test.ts

import 'server-only';
import type { SendEmailResult } from './resend';

export type StubSendEmailResult = SendEmailResult | { skipped: true };

/**
 * Stub matching the production lib/resend.ts::sendEmail signature.
 * Always returns { skipped: true } without contacting any external service.
 * Logs UUIDs only (CLAUDE.md Rule 10 — no PII).
 */
export async function sendEmail(_opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<StubSendEmailResult> {
  // Log a recognisable marker, but NEVER include the recipient address.
  // The action layer already logs its own "queued" message with UUIDs only;
  // the stub's log here is intentionally minimal.
  // eslint-disable-next-line no-console
  console.log('[devEmailStub] sendEmail called — RESEND_API_KEY unset, would-be send skipped');
  return { skipped: true };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run lib/devEmailStub.test.ts 2>&1 | tail -10
```

Expected: `Tests  1 passed (1)` · exit 0.

The test imports `SendEmailResult` from `./resend` which doesn't exist yet — TypeScript may complain. The test will still run because vitest doesn't fail on missing types at runtime. If tsc complains right now, the type will resolve when Task 3 lands.

**Step 5: Verify tsc state (may have one expected error)**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit 2>&1 | tail -10
```

Expected: ONE error referencing the missing `SendEmailResult` export from `./resend`. That's expected — Task 3 lands it. If you see other errors, stop and investigate.

**Step 6: Commit**

```bash
cd /Users/ivan/Eventar && git add lib/devEmailStub.ts lib/devEmailStub.test.ts && git commit -m "$(cat <<'EOF'
feat(email): lib/devEmailStub.ts — testing stub for pre-credentials phase

⚠️ This file is marked for removal once RESEND_API_KEY lands in .env.local.
See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol"
for the 3-minute cleanup steps.

The stub matches the production lib/resend.ts::sendEmail signature with
one extra result variant ({ skipped: true }). Returns skipped without
any external call. Logs a marker without recipient PII (Rule 10).

tsc currently shows one expected error (SendEmailResult import from
./resend not yet exported) — resolves when Task 3 lands resend.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: lib/resend.ts (production facade)

**Files:**
- Create: `lib/resend.ts`
- Create: `lib/resend.test.ts`

**Step 1: Write the three failing tests**

Create `lib/resend.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));

// Mock the Resend SDK at the module level. Per-test we configure mockSend.
const mockSend = vi.fn();
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { sendEmail } from './resend';

describe('lib/resend.sendEmail', () => {
  beforeEach(() => {
    mockSend.mockReset();
    process.env.RESEND_API_KEY = 'test_key_re_xxxxxxxx';
    process.env.RESEND_FROM_EMAIL = 'Eventar Test <test@example.com>';
  });

  it('throws clear error when RESEND_API_KEY is unset', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(
      sendEmail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }),
    ).rejects.toThrow(/RESEND_API_KEY is required/);
  });

  it('returns { ok, id } when Resend SDK succeeds', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: 're_123abc' }, error: null });
    const result = await sendEmail({
      to: 'a@b.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
    });
    expect(result).toEqual({ ok: true, id: 're_123abc' });
    expect(mockSend).toHaveBeenCalledWith({
      from: 'Eventar Test <test@example.com>',
      to: 'a@b.com',
      subject: 'Welcome',
      html: '<p>hi</p>',
    });
  });

  it('returns { error: { code, message } } when Resend returns an API error', async () => {
    mockSend.mockResolvedValueOnce({
      data: null,
      error: { name: 'validation_error', message: 'Invalid recipient', statusCode: 422 },
    });
    const result = await sendEmail({
      to: 'invalid',
      subject: 'x',
      html: '<p>x</p>',
    });
    expect(result).toEqual({
      error: { code: 'validation_error', message: 'Invalid recipient' },
    });
  });

  it('returns { error } when the SDK throws (network failure)', async () => {
    mockSend.mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' }));
    const result = await sendEmail({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' });
    expect(result).toEqual({
      error: { code: 'ECONNRESET', message: 'ECONNRESET' },
    });
  });
});
```

**Step 2: Run tests to verify they all fail (module not found)**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run lib/resend.test.ts 2>&1 | tail -20
```

Expected: FAIL with module-not-found for `./resend`.

**Step 3: Implement the facade**

Create `lib/resend.ts`:

```ts
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
```

**Step 4: Run tests to verify they all pass**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run lib/resend.test.ts 2>&1 | tail -15
```

Expected: `Tests  4 passed (4)` · exit 0.

**Step 5: Confirm full tsc + vitest also pass (regression check)**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit && pnpm exec vitest run 2>&1 | tail -10
```

Expected: tsc clean; vitest `Tests  170+ passed` (depends on what's accumulated). The expected error from Task 2 about `SendEmailResult` should now resolve.

**Step 6: Commit**

```bash
cd /Users/ivan/Eventar && git add lib/resend.ts lib/resend.test.ts && git commit -m "$(cat <<'EOF'
feat(email): lib/resend.ts — production Resend facade

Single async sendEmail({ to, subject, html }) function with typed
result: { ok, id } | { error: { code, message } }. Reads RESEND_API_KEY
lazily; throws on missing key (production misconfig must surface,
Rule 12). Reads RESEND_FROM_EMAIL with sandbox default
'Eventar <onboarding@resend.dev>'.

No retry, no backoff, no caching — Phase 9 cron is the retry layer
for #2/#3; Email #1 is fire-and-forget per registration.

No PII in the returned error: only Resend's error code + message,
never the recipient address.

Tests cover 4 paths: missing key throws, ok response, Resend API
error response, SDK throws (network).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: emails/confirmation.tsx (the template)

**Files:**
- Create: `emails/confirmation.tsx`
- Create: `emails/confirmation.test.tsx`

**Step 1: Write the failing tests**

Create `emails/confirmation.test.tsx`:

```ts
import { describe, expect, it } from 'vitest';
import { renderConfirmationEmail } from './confirmation';

describe('renderConfirmationEmail', () => {
  const sampleProps = {
    recipientName: 'Alice Liddell',
    eventTitle: 'Q3 Engineering All-Hands',
    eventStart: 'Wed, 12 Sep 2026 · 10:00 AM HKT',
    eventVenue: 'Conference Room A, 12/F HQ',
    eventUrl: 'https://eventar.example.com/events/abc-123',
    registrationCode: 'WK-2345XY',
  };

  it('rendered HTML contains the registration code, event title, and event URL', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('WK-2345XY');
    expect(html).toContain('Q3 Engineering All-Hands');
    expect(html).toContain('https://eventar.example.com/events/abc-123');
  });

  it('rendered HTML contains greeting with recipient name + venue', async () => {
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).toContain('Alice Liddell');
    expect(html).toContain('Conference Room A, 12/F HQ');
  });

  it('rendered HTML does not contain literal "undefined" or "null"', async () => {
    // Guard against props leaking through with missing values.
    const html = await renderConfirmationEmail(sampleProps);
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });
});
```

**Step 2: Run tests to verify they fail**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run emails/confirmation.test.tsx 2>&1 | tail -10
```

Expected: FAIL with module-not-found.

**Step 3: Implement the template**

Create `emails/confirmation.tsx`:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import { render } from '@react-email/render';

export type ConfirmationEmailProps = {
  recipientName: string;
  eventTitle: string;
  eventStart: string;
  eventVenue: string;
  eventUrl: string;
  registrationCode: string;
};

// Indigo brand palette aligned with the in-app M3 design tokens (Phase 4.6).
// Email clients strip Tailwind/CSS — all styling is inline via React Email props.
const COLOR_PRIMARY = '#4F46E5';
const COLOR_BG = '#F8F7FB';
const COLOR_SURFACE = '#FFFFFF';
const COLOR_TEXT = '#1F1A2E';
const COLOR_MUTED = '#6B6776';
const COLOR_CODE_BG = '#EEF1FF';
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

export default function ConfirmationEmail({
  recipientName,
  eventTitle,
  eventStart,
  eventVenue,
  eventUrl,
  registrationCode,
}: ConfirmationEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`You're registered: ${eventTitle}`}</Preview>
      <Body style={{ backgroundColor: COLOR_BG, fontFamily: FONT_FAMILY, margin: 0, padding: '24px 0' }}>
        <Container style={{ backgroundColor: COLOR_SURFACE, maxWidth: '560px', margin: '0 auto', padding: '32px', borderRadius: '12px' }}>
          <Heading as="h1" style={{ color: COLOR_PRIMARY, fontSize: '24px', margin: '0 0 24px', letterSpacing: '0.02em' }}>
            Eventar
          </Heading>

          <Text style={{ color: COLOR_TEXT, fontSize: '16px', lineHeight: '24px', margin: '0 0 16px' }}>
            Hi {recipientName},
          </Text>

          <Text style={{ color: COLOR_TEXT, fontSize: '16px', lineHeight: '24px', margin: '0 0 24px' }}>
            You&apos;re registered for <strong>{eventTitle}</strong>. Here are the details.
          </Text>

          <Section style={{ backgroundColor: COLOR_BG, borderRadius: '8px', padding: '16px 20px', margin: '0 0 24px' }}>
            <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
              When
            </Text>
            <Text style={{ color: COLOR_TEXT, fontSize: '15px', margin: '0 0 12px' }}>
              {eventStart}
            </Text>
            <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>
              Where
            </Text>
            <Text style={{ color: COLOR_TEXT, fontSize: '15px', margin: '0' }}>
              {eventVenue}
            </Text>
          </Section>

          <Text style={{ color: COLOR_MUTED, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
            Your registration code · keep this for the door
          </Text>
          <Section style={{ backgroundColor: COLOR_CODE_BG, borderRadius: '8px', padding: '16px 20px', margin: '0 0 28px', textAlign: 'center' }}>
            <Text style={{ color: COLOR_PRIMARY, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '20px', fontWeight: 600, letterSpacing: '0.15em', margin: 0 }}>
              {registrationCode}
            </Text>
          </Section>

          <Section style={{ textAlign: 'center', margin: '0 0 28px' }}>
            <Button
              href={eventUrl}
              style={{
                backgroundColor: COLOR_PRIMARY,
                color: '#FFFFFF',
                fontSize: '15px',
                fontWeight: 600,
                padding: '12px 24px',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'inline-block',
              }}
            >
              View event details
            </Button>
          </Section>

          <Text style={{ color: COLOR_MUTED, fontSize: '14px', lineHeight: '20px', margin: '0 0 24px' }}>
            We&apos;ll send your personal check-in QR code shortly before the event.
          </Text>

          <Hr style={{ borderColor: COLOR_BG, margin: '0 0 16px' }} />

          <Text style={{ color: COLOR_MUTED, fontSize: '12px', margin: 0 }}>
            — Eventar · Internal workshop manager
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/**
 * Server-side render of the template to an HTML string. Used by
 * registerForEvent (Phase 7) and any future cron-driven sender.
 */
export async function renderConfirmationEmail(props: ConfirmationEmailProps): Promise<string> {
  return render(<ConfirmationEmail {...props} />);
}
```

**Step 4: Run tests to verify they pass**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run emails/confirmation.test.tsx 2>&1 | tail -10
```

Expected: `Tests  3 passed (3)` · exit 0.

**Step 5: Confirm tsc still clean**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit 2>&1 | tail -10
```

Expected: empty output.

**Step 6: Commit**

```bash
cd /Users/ivan/Eventar && git add emails/confirmation.tsx emails/confirmation.test.tsx && git commit -m "$(cat <<'EOF'
feat(email): emails/confirmation.tsx — React Email template for Email #1

Pure-presentation template, props pre-formatted at call site (no
lib/tz.ts or lib/origin.ts imports in emails/*). Renders synchronously
via @react-email/render's async render() — returns HTML string.

Visual: indigo brand line, greeting, event details card, registration
code in a monospace pill, CTA button to public event page, reminder
note setting expectation for Email #2 (Phase 9), footer. All inline
styles per email-client constraints.

3 tests verify rendered HTML contains the meaningful payload
(registration code, title, URL, name, venue) and rejects literal
"undefined"/"null" leaks from missing optional props.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire into `registerForEvent`

**Files:**
- Modify: `app/(public)/events/[id]/actions.ts` (step 5 SELECT shape + step 6/7 swap + imports)
- Modify: `app/(public)/events/[id]/actions.test.ts` (extend with 3 new cases)

**Step 1: Read the current actions.ts to confirm insertion points**

Run:
```bash
cd /Users/ivan/Eventar && wc -l 'app/(public)/events/[id]/actions.ts'
```

Then read it (the executing agent should do this — Read tool, no offset/limit needed; file is ~165 lines).

Key markers to locate:
- The import block at the top (~lines 1–10)
- The for-loop at step 5 with `let reg: { id: string } | null = null;` and the `.select('id')` inside the loop body
- Step 6's `console.log(...)`
- Step 7's `email_log` UPDATE with `status: 'sent'`

**Step 2: Write the failing tests (3 new cases)**

Open `app/(public)/events/[id]/actions.test.ts`. Locate the existing `describe('registerForEvent', ...)` block. Add the following test cases inside it, after the existing ones. Note: the test file already mocks Supabase; we add Resend mocks alongside.

```ts
// Add to the top of the file, after existing vi.mock calls:
const mockSendReal = vi.fn();
const mockSendStub = vi.fn();
vi.mock('@/lib/resend', () => ({ sendEmail: mockSendReal }));
vi.mock('@/lib/devEmailStub', () => ({ sendEmail: mockSendStub }));

// Inside the existing describe block, add new it() cases:

it('uses devEmailStub when RESEND_API_KEY is unset → email_log stays queued', async () => {
  delete process.env.RESEND_API_KEY;
  mockSendStub.mockResolvedValueOnce({ skipped: true });
  mockSendReal.mockClear();

  // [test setup mirroring existing pattern — published event row, etc.]
  // [call registerForEvent with valid input]
  // [assert result is success]

  expect(mockSendStub).toHaveBeenCalledTimes(1);
  expect(mockSendReal).not.toHaveBeenCalled();

  // email_log should be in 'queued' state — i.e. step 7 didn't update status
  // [assert via the supabase admin mock's update calls]
});

it('uses real sender when RESEND_API_KEY is set; ok response → email_log sent', async () => {
  process.env.RESEND_API_KEY = 'test_key';
  mockSendReal.mockResolvedValueOnce({ ok: true, id: 're_test_xyz' });
  mockSendStub.mockClear();

  // [test setup + call]

  expect(mockSendReal).toHaveBeenCalledTimes(1);
  expect(mockSendStub).not.toHaveBeenCalled();

  // email_log update should include status: 'sent' and sent_at
  // [assert via mock]
});

it('uses real sender; error response → email_log failed with code+message', async () => {
  process.env.RESEND_API_KEY = 'test_key';
  mockSendReal.mockResolvedValueOnce({
    error: { code: 'rate_limit_exceeded', message: 'Too many requests' },
  });

  // [test setup + call]
  // [assert registration still succeeded]

  // email_log update should include status: 'failed' and error: 'rate_limit_exceeded: Too many requests'
  // [assert via mock]
});
```

The bracketed `[test setup]` lines indicate where the existing test setup pattern from the file goes. The executing agent should mirror the existing happy-path test in the same file rather than re-invent the supabase mocks.

**Step 3: Run the new tests to verify they fail**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec vitest run 'app/(public)/events/[id]/actions.test.ts' 2>&1 | tail -15
```

Expected: 3 FAILs because the production code doesn't yet call sendEmail at all. Existing tests should still pass.

**Step 4: Update `actions.ts` — imports**

At the top of `app/(public)/events/[id]/actions.ts`, after the existing imports:

```ts
// TEMP: dual import while RESEND_API_KEY is being set up.
// REMOVE both lines + the env-switch below once the key is in .env.local.
// See docs/plans/2026-06-04-phase-7-resend-design.md §"Removal protocol".
import { sendEmail as sendEmailReal } from '@/lib/resend';
import { sendEmail as sendEmailStub } from '@/lib/devEmailStub';
import { renderConfirmationEmail } from '@/emails/confirmation';
import { getRequestOrigin } from '@/lib/origin';
import { formatInTz } from '@/lib/tz';
```

**Step 5: Update step 5 — widen the insert's `.select()` to include `registration_code`**

Locate inside the for loop:

```ts
let reg: { id: string } | null = null;
```

Change to:

```ts
let reg: { id: string; registration_code: string } | null = null;
```

And inside the same loop body, find:

```ts
const insertResult = await admin
  .from('registrations')
  .insert({ event_id, email, full_name, registration_code: candidate })
  .select('id')
  .single();
```

Change `.select('id')` to `.select('id, registration_code')`.

**Step 6: Replace step 6 + step 7**

Locate the existing step 6 (`console.log(\`[email stub]...\`);`) and step 7 (the `email_log.update({ status: 'sent', sent_at, registration_id })` block). Replace them entirely with:

```ts
  // Step 6 — render template + dispatch via the facade.
  // TEMP: env switch picks devEmailStub when RESEND_API_KEY unset. See design doc.
  const sendEmail = process.env.RESEND_API_KEY ? sendEmailReal : sendEmailStub;

  const origin = await getRequestOrigin();
  const eventVenue = event.venue_address ? `${event.venue_name}, ${event.venue_address}` : event.venue_name;

  // Per design doc: props pre-formatted at call site; template stays pure presentation.
  const html = await renderConfirmationEmail({
    recipientName: full_name,
    eventTitle: event.title,
    eventStart: formatInTz(event.start_time, event.timezone),
    eventVenue,
    eventUrl: `${origin}/events/${event.id}`,
    registrationCode: reg.registration_code,
  });

  const sendResult = await sendEmail({
    to: email,
    subject: `You're registered: ${event.title}`,
    html,
  });

  // Step 7 — close the ledger per outcome; registration_id always set.
  const logUpdate: Record<string, unknown> = { registration_id: reg.id };
  if ('ok' in sendResult) {
    logUpdate.status = 'sent';
    logUpdate.sent_at = new Date().toISOString();
  } else if ('skipped' in sendResult) {
    // TEMP: this branch goes away when the stub is removed.
    // email_log.status stays 'queued' (set at step 4); no Phase 9 sweep planned.
    console.log(
      `[email queued] confirmation for event ${event.id} registration ${reg.id} — RESEND_API_KEY unset`,
    );
  } else {
    logUpdate.status = 'failed';
    logUpdate.error = `${sendResult.error.code}: ${sendResult.error.message}`;
  }
  const { error: closeErr } = await admin.from('email_log').update(logUpdate).eq('id', log.id);
  if (closeErr) {
    console.error('[registerForEvent] failed to close email_log row', {
      id: log.id,
      error: closeErr.message,
    });
  }
```

**Step 7: You also need to fetch `venue_address` in step 2's event SELECT**

Locate the event read in step 2:

```ts
const { data: event } = await anon
  .from('events')
  .select('id, title, status, max_attendees')
```

Extend to:

```ts
const { data: event } = await anon
  .from('events')
  .select('id, title, status, max_attendees, start_time, timezone, venue_name, venue_address')
```

Why: the email template props need `start_time`, `timezone`, `venue_name`, `venue_address`. They weren't needed by the original stub.

**Step 8: Run the full test suite to verify all 3 new tests pass and nothing regresses**

Run:
```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run 2>&1 | tail -15
```

Expected:
- tsc clean (no output)
- eslint clean
- vitest `Tests  17X passed (17X)` where X = previous + 3 new

If any test fails, read the failure carefully — the most common issue is a mock that doesn't match the action's actual call shape, or a stale event row in the test setup that's missing the new columns.

**Step 9: Commit**

```bash
cd /Users/ivan/Eventar && git add 'app/(public)/events/[id]/actions.ts' 'app/(public)/events/[id]/actions.test.ts' && git commit -m "$(cat <<'EOF'
feat(email): wire Resend facade into registerForEvent step 6+7

Replaces the Phase-2 console.log stub at step 6 with the production
sendEmail facade (lib/resend.ts) when RESEND_API_KEY is present,
falling back to lib/devEmailStub.ts (returns { skipped: true }) when
the env is unset — a temp arrangement until credentials land.

Mechanical changes:
  - Step 2 event SELECT widened to include start_time, timezone,
    venue_name, venue_address (needed for the template props).
  - Step 5 registration insert SELECT widened from .select('id')
    to .select('id, registration_code') so the assigned code is
    available after the retry loop without an extra round-trip
    or a mutable local outside the loop.
  - Step 6 renders confirmation.tsx with pre-formatted props
    (formatInTz for time, getRequestOrigin for URL); dispatches via
    the env-driven sendEmail facade.
  - Step 7's email_log update branches on send result: ok →
    'sent'+sent_at; skipped → no status change (stays 'queued');
    error → 'failed' + 'code: message' (no PII per Rule 10).

3 new vitest cases cover the three send-result branches via vi.mock
on @/lib/resend and @/lib/devEmailStub plus per-test env mutation.

CLAUDE.md hard rule 2 (email_log row FIRST, send SECOND) preserved
— the row is still inserted at step 4 before any sendEmail call.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: .env.example update

**Files:**
- Modify: `.env.example`

**Step 1: Read current .env.example**

Run:
```bash
cd /Users/ivan/Eventar && cat .env.example
```

Confirm the existing 4 vars (Supabase URL/anon/service-role, Mapbox token, NEXT_PUBLIC_SITE_URL).

**Step 2: Append the two new vars with comments**

Append to the bottom of `.env.example`:

```
# Resend transactional email (Phase 7+).
# Required for sending Email #1 (registration confirmation). When unset,
# the action falls back to lib/devEmailStub.ts (logs + email_log stays
# 'queued'). Get a key from https://resend.com → API Keys.
# Set this and follow docs/plans/2026-06-04-phase-7-resend-design.md
# §"Removal protocol" to remove the dev stub.
RESEND_API_KEY=re_…

# Sender identity. Defaults to 'Eventar <onboarding@resend.dev>' (Resend's
# sandbox sender — works without domain verification). Override once a
# custom domain is verified on Resend.
RESEND_FROM_EMAIL='Eventar <noreply@your-domain.example>'
```

**Step 3: Commit**

```bash
cd /Users/ivan/Eventar && git add .env.example && git commit -m "$(cat <<'EOF'
docs(env): document RESEND_API_KEY + RESEND_FROM_EMAIL in .env.example

Phase 7 added two new env vars used by lib/resend.ts:
  - RESEND_API_KEY: required for real sends; absence triggers the dev
    stub (see lib/devEmailStub.ts).
  - RESEND_FROM_EMAIL: sender identity, defaults to Resend's sandbox
    sender — override once a custom domain is verified.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: PROJECT_STATE.md rotation

**Files:**
- Modify: `docs/plans/PROJECT_STATE.md`

**Step 1: Update the date + status header**

Find:
```md
_Last updated: 2026-06-02 (post-R1 + M1 + Q19 access policy refinement)_
```

Replace with:
```md
_Last updated: 2026-06-04 (Phase 7 Resend integration shipped — credentials pending)_
```

**Step 2: Move Phase 7 from ACTIVE → JUST SHIPPED; promote Phase 8 to ACTIVE**

Find the existing ACTIVE PHASE section (Phase 7) and JUST SHIPPED section (Phase 6.5). Restructure:

**Was (ACTIVE PHASE — Phase 7):**

Keep the file's existing section structure intact but rewrite:

- **ACTIVE PHASE** header: change from "Phase 7 (next)" to "Phase 8 (next) — Vercel deploy"
  - Active files: env-var setup in Vercel (RESEND_API_KEY, RESEND_FROM_EMAIL, NEXT_PUBLIC_SITE_URL, SUPABASE_*)
  - Pre-deploy: remove devEmailStub per design doc removal protocol once RESEND_API_KEY is real and set locally + verified
  - Domain verification on Resend before first prod registration

- **JUST SHIPPED** header: change to "Phase 7 — Resend integration (code-only; credentials pending)"
  - Two new lib files (resend.ts, devEmailStub.ts); template at emails/confirmation.tsx
  - Integration in registerForEvent step 6+7
  - 9 new vitest tests; total now ~178
  - Design doc + plan: docs/plans/2026-06-04-phase-7-resend-design.md and -resend.md

**Step 3: Update CARRIED-FORWARD CONSIDERATIONS**

Add a bullet:
- **devEmailStub removal:** Once RESEND_API_KEY is set in `.env.local` and a smoke registration confirms the real Resend path works, remove the temp per the protocol in `docs/plans/2026-06-04-phase-7-resend-design.md` §"Removal protocol." Until then, ALL registrations log "[email queued]" — no real email sends.

**Step 4: Commit**

```bash
cd /Users/ivan/Eventar && git add docs/plans/PROJECT_STATE.md && git commit -m "$(cat <<'EOF'
docs(state): Phase 7 shipped (code) — credentials + Phase 8 next

Rotates PROJECT_STATE.md per phase boundary:
  - JUST SHIPPED: Phase 7 Resend integration (lib/resend.ts +
    lib/devEmailStub.ts + emails/confirmation.tsx + registerForEvent
    integration + .env.example docs). Credentials still pending — all
    registrations currently log queued.
  - ACTIVE PHASE: Phase 8 Vercel deploy. Operational work (env vars,
    domain config), no Phase-7-blocking code.
  - CARRIED FORWARD: devEmailStub removal protocol (3-minute cleanup
    once RESEND_API_KEY is real in .env.local).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Final verification + smoke

**Files:** none

**Step 1: Run full static gates**

```bash
cd /Users/ivan/Eventar && pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build 2>&1 | tail -30
```

Expected:
- tsc: empty output
- eslint: empty or only the (known) workspace-root lockfile warning
- vitest: `Tests  178 passed (178)` (or whatever the new total is — 169 + 9 = 178)
- next build: routes table at end shows the same 14 routes as before (no new routes introduced); exit 0

**Step 2: Manual dev smoke — confirm stub path works without RESEND_API_KEY**

Pre-condition: user's `pnpm dev` is running on `:3000`. RESEND_API_KEY is unset in `.env.local`.

Navigate (or curl) to a published event's public page and attempt a registration through the form. Observe in the dev server's terminal:

Expected log line:
```
[devEmailStub] sendEmail called — RESEND_API_KEY unset, would-be send skipped
[email queued] confirmation for event <UUID> registration <UUID> — RESEND_API_KEY unset
```

Then verify in Supabase dashboard SQL editor:
```sql
select id, purpose, status, registration_id, sent_at, error
from public.email_log
where status = 'queued'
order by created_at desc
limit 5;
```

Expected: the new row has `status='queued'`, `registration_id` populated, `sent_at` null, `error` null.

**Step 3: (When user is ready) Manual prod-path smoke — add a real API key**

Pre-condition: user has signed up at https://resend.com, generated an API key, and pasted it into `.env.local` as `RESEND_API_KEY=re_...`. Dev server restarted.

Register through the form. Observe:

Expected log line:
```
(no [devEmailStub] line; sendEmail goes to lib/resend.ts directly)
```

Then verify:
```sql
select id, status, sent_at, error
from public.email_log
where status = 'sent'
order by created_at desc
limit 5;
```

Expected: row has `status='sent'`, `sent_at` set, `error` null. The user's inbox (or onboarding@resend.dev test inbox) receives the confirmation email.

**Step 4: Visual inspection of the rendered email**

Open the received email in 2-3 clients (Gmail web, Apple Mail, Outlook web). Verify:
- Brand line "Eventar" renders in indigo
- Event title, time, venue display correctly
- Registration code displays in monospace
- "View event details" button is clickable and points to the right URL
- No raw HTML / undefined / null literals visible

Any layout issues → iterate on `emails/confirmation.tsx`; the props contract is the contract, render layer is the variable.

**Step 5 (only if real path tested): trigger the removal protocol**

Per design doc §"Removal protocol", at the user's discretion once the prod path is verified:

```bash
cd /Users/ivan/Eventar && rm lib/devEmailStub.ts lib/devEmailStub.test.ts
# Then edit app/(public)/events/[id]/actions.ts:
#   - delete the `sendEmailStub` import
#   - replace the env switch with a static `const sendEmail = sendEmailReal;`
#     (or just rename sendEmailReal → sendEmail and drop the alias)
#   - delete the `else if ('skipped' in sendResult)` branch
# Then edit app/(public)/events/[id]/actions.test.ts:
#   - drop the "uses devEmailStub" test case
#   - drop the vi.mock('@/lib/devEmailStub', ...) call
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run
git add -A && git commit -m "chore(phase-7): remove devEmailStub now that RESEND_API_KEY is configured"
```

This step is **NOT** part of the plan's task sequence — it's a cleanup the user runs when ready. Documented here for completeness.

---

## Summary

8 tasks producing 7 commits (Task 8 is verification-only, no commit unless cleanup is needed):

```
Task 1 → chore(deps): add resend + @react-email packages
Task 2 → feat(email): lib/devEmailStub.ts — testing stub
Task 3 → feat(email): lib/resend.ts — production facade
Task 4 → feat(email): emails/confirmation.tsx — React Email template
Task 5 → feat(email): wire Resend facade into registerForEvent step 6+7
Task 6 → docs(env): document new env vars
Task 7 → docs(state): Phase 7 shipped (code) — credentials + Phase 8 next
Task 8 → (verification only; no commit unless smoke surfaces issues)
```

**Final test count:** ~178 (169 → +9 from this phase).
**New routes:** zero.
**New tables:** zero.
**Breaking changes:** none for users; one breaking change for the dev workflow (no real emails until RESEND_API_KEY lands, but that was already the case via Phase 2 stub).
**Removal cost:** documented in design doc; ~3 minutes once credentials are real.

If any task surfaces an unexpected issue, **STOP and surface it** rather than improvising — the design doc captured the agreed shape; deviations should be confirmed with the user.
