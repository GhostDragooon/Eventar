# Phase 3 — QR Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Download QR" button on the edit page of published events. Clicking it downloads a 512×512 PNG QR code that encodes the event's public URL.

**Architecture:** One Server Action (`getEventQrPng`) returns base64-encoded PNG bytes + a slugified filename. A small client component (`DownloadQrButton`) calls the action, builds a `data:image/png;base64,...` URL, and triggers a browser download via a synthetic `<a download>` click. No new routes, no Supabase Storage, no new tables.

**Tech Stack:** Next.js 16 App Router, TypeScript, `qrcode` npm package (server-side), `@types/qrcode`, existing `supabaseServer()` helper, existing `requireStaff()` auth gate, vitest for unit tests.

**Design doc:** [`docs/plans/2026-05-21-eventar-phase-3-qr-design.md`](./2026-05-21-eventar-phase-3-qr-design.md). Read before starting if you don't have the design in working memory.

---

## Pre-flight

- Working directory: `/Users/ivan/Eventar`
- Branch: `main` (single-branch policy per CLAUDE.md rule 6)
- Confirm tree is clean: `git status` shows "nothing to commit, working tree clean"
- Confirm gates pass at start: `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run`
- User's `pnpm dev` is already running on port 3000 — do NOT start another dev server (port conflict + user direction)

---

## Task 1: Add `qrcode` dependency

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Step 1: Install runtime + types**

Run: `pnpm add qrcode && pnpm add -D @types/qrcode`

Expected: two `package.json` lines added (one in `dependencies`, one in `devDependencies`); `pnpm-lock.yaml` updated.

**Step 2: Verify package resolves**

Run: `pnpm exec tsc --noEmit`

Expected: no errors. The package is not yet imported anywhere, but tsc should still resolve the types cleanly.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(phase-3): add qrcode + @types/qrcode for server-side PNG generation"
```

---

## Task 2: `slugifyTitle` pure function (TDD)

**Files:**
- Create: `lib/slugify.ts`
- Create: `lib/slugify.test.ts`

**Step 1: Write failing tests**

Create `lib/slugify.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slugifyTitle } from './slugify';

describe('slugifyTitle', () => {
  it('lowercases and replaces non-alphanumerics with single dash', () => {
    expect(slugifyTitle('Internal Workshop 2026')).toBe('internal-workshop-2026');
  });

  it('trims leading/trailing whitespace + collapses interior runs', () => {
    expect(slugifyTitle('  Hello   World!  ')).toBe('hello-world');
  });

  it('strips leading/trailing dashes', () => {
    expect(slugifyTitle('!!Title!!')).toBe('title');
  });

  it('returns empty string for symbols-only input (caller falls back to id)', () => {
    expect(slugifyTitle('!!!')).toBe('');
    expect(slugifyTitle('   ')).toBe('');
    expect(slugifyTitle('')).toBe('');
  });

  it('caps at 60 chars, truncating at the last full word boundary if possible', () => {
    const longTitle = 'a'.repeat(70);
    expect(slugifyTitle(longTitle)).toHaveLength(60);
    const multiWord = 'one two three four five six seven eight nine ten eleven twelve';
    const result = slugifyTitle(multiWord);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith('-')).toBe(false);
  });

  it('handles unicode by stripping it (ASCII-only output)', () => {
    expect(slugifyTitle('Café—Tokyo')).toBe('caf-tokyo');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run lib/slugify.test.ts`

Expected: FAIL with "Cannot find module './slugify'" or similar import error.

**Step 3: Implement `lib/slugify.ts`**

```ts
/**
 * Slugify a title for use in a filename: lowercase ASCII alphanumerics with dashes.
 * Returns empty string when the input has no usable characters — caller should fall
 * back to an id-based name.
 */
export function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (cleaned.length <= 60) return cleaned;

  // Try to cut at a dash within the 60-char window
  const lastDash = cleaned.lastIndexOf('-', 60);
  if (lastDash > 30) return cleaned.slice(0, lastDash);
  // Otherwise hard cut
  return cleaned.slice(0, 60).replace(/-+$/, '');
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run lib/slugify.test.ts`

Expected: PASS, 6/6 tests.

**Step 5: Confirm whole suite still green**

Run: `pnpm exec vitest run`

Expected: 65/65 tests pass (59 existing + 6 new).

**Step 6: Commit**

```bash
git add lib/slugify.ts lib/slugify.test.ts
git commit -m "feat(phase-3): slugifyTitle pure function for QR filenames (TDD)"
```

---

## Task 3: `getEventQrPng` Server Action

**Files:**
- Modify: `app/events/[id]/edit/actions.ts`

**Step 1: Add the async function**

Open `app/events/[id]/edit/actions.ts`. The file currently has `'use server'` + `publishEvent`. Add imports and the new function. Final file content:

```ts
'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { requireStaff } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { slugifyTitle } from '@/lib/slugify';

export async function publishEvent(id: string) {
  await requireStaff();
  const supabase = await supabaseServer();
  // .select() + .maybeSingle() lets us detect when the update affected 0
  // rows — which happens when RLS silently blocks (e.g. organizer trying
  // to publish another organizer's event). Without this check, the action
  // would return success but the event status would stay 'draft' (silent
  // failure — CLAUDE.md rule 12).
  const { data, error } = await supabase
    .from('events')
    .update({ status: 'published' })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Cannot publish: event not found or not owned by you.');
  revalidatePath(`/events/${id}/edit`);
  revalidatePath(`/events/${id}`);
  revalidatePath('/dashboard');
}

export async function getEventQrPng(
  eventId: string,
): Promise<{ pngBase64: string; filename: string } | { error: string }> {
  await requireStaff();
  const supabase = await supabaseServer();

  const { data: event } = await supabase
    .from('events')
    .select('id, title, status')
    .eq('id', eventId)
    .maybeSingle();

  // Silent-failure-visibility: surface "not found" rather than RLS-redirect to
  // a 0-row success (CLAUDE.md rule 12). Same pattern as publishEvent.
  if (!event) {
    return { error: 'Event not found.' };
  }

  // Defense in depth — the UI also gates on event.status === 'published'.
  if (event.status !== 'published') {
    return { error: 'QR is available after publishing.' };
  }

  // Origin from request headers so this works on localhost, Vercel preview,
  // and prod (same pattern as sendMagicLink).
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  const publicUrl = `${proto}://${host}/events/${event.id}`;

  // qrcode defaults are fine: errorCorrectionLevel 'M' = ~15% tolerance,
  // good for print under bad lighting. Margin 2 (default is 4) maximises QR area.
  const buf = await QRCode.toBuffer(publicUrl, {
    errorCorrectionLevel: 'M',
    width: 512,
    margin: 2,
  });

  const slug = slugifyTitle(event.title);
  const filename = `event-${slug || event.id}.png`;

  return { pngBase64: buf.toString('base64'), filename };
}
```

**Step 2: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint app/events/\[id\]/edit/actions.ts`

Expected: clean.

**Step 3: Sanity-check full vitest**

Run: `pnpm exec vitest run`

Expected: 65/65 pass (no test added for the Server Action — project convention is to test pure pieces + cover Server Actions via manual smoke).

**Step 4: Commit**

```bash
git add app/events/\[id\]/edit/actions.ts
git commit -m "feat(phase-3): getEventQrPng server action (auth + RLS + status gate)"
```

---

## Task 4: `DownloadQrButton` client component

**Files:**
- Create: `components/DownloadQrButton.tsx`

**Step 1: Implement the component**

Create `components/DownloadQrButton.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { getEventQrPng } from '@/app/events/[id]/edit/actions';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

export default function DownloadQrButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function onClick() {
    setState({ kind: 'loading' });
    startTransition(async () => {
      const res = await getEventQrPng(eventId);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      // Build a data URL and trigger a download via a synthetic <a>.
      const href = `data:image/png;base64,${res.pngBase64}`;
      const a = document.createElement('a');
      a.href = href;
      a.download = res.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setState({ kind: 'idle' });
    });
  }

  const isLoading = state.kind === 'loading';
  const errorMessage = state.kind === 'error' ? state.message : null;

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={isLoading}>
        {isLoading ? 'Preparing…' : 'Download QR'}
      </Button>
      {errorMessage && (
        <p className="text-sm text-red-700">⚠ {errorMessage}</p>
      )}
    </div>
  );
}
```

**Step 2: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint components/DownloadQrButton.tsx`

Expected: clean.

**Step 3: Commit**

```bash
git add components/DownloadQrButton.tsx
git commit -m "feat(phase-3): DownloadQrButton client component (idle/loading/error)"
```

---

## Task 5: Wire QR section into the edit page

**Files:**
- Modify: `app/events/[id]/edit/page.tsx`

**Step 1: Add the import + section**

Read `app/events/[id]/edit/page.tsx` first to see its current shape. Identify where the Publish button is rendered.

Add:
- Import at top: `import DownloadQrButton from '@/components/DownloadQrButton';`
- Below the Publish button, inside the main render output, add the QR section conditional on `event.status === 'published'`:

```tsx
{event.status === 'published' && (
  <section>
    <h2 className="text-lg font-medium mb-2">QR code</h2>
    <p className="text-sm text-gray-600 mb-3">
      Anyone who scans this lands on the public registration page.
    </p>
    <DownloadQrButton eventId={event.id} />
  </section>
)}
```

If the page already wraps its content in `<main className="…space-y-6">` or similar, the section will inherit the spacing. Otherwise add `className="mt-6"` to the section.

**Step 2: Run static gates**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint app/events/\[id\]/edit/page.tsx && pnpm exec next build 2>&1 | tail -15`

Expected: clean. `next build` should still produce 8 routes (no new routes added; only the existing edit page changed).

**Step 3: Commit**

```bash
git add app/events/\[id\]/edit/page.tsx
git commit -m "feat(phase-3): QR section on edit page for published events"
```

---

## Task 6: Verification + manual smoke

**Step 1: Run the full gate sweep**

```bash
pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec vitest run && pnpm exec next build
```

Expected:
- tsc: clean
- eslint: clean
- vitest: 65/65 pass (59 original + 6 slugify)
- next build: 8 routes, no errors

**Step 2: Manual smoke (browser)**

User's `pnpm dev` is running on http://localhost:3000. Walk through (or have the user walk through):

1. Log in as `ahf.ivan@gmail.com`.
2. Find a **draft** event in the dashboard. Open its edit page. **Verify NO QR section is visible.**
3. Find or create a **published** event (REPRO-PUB if still around). Open its edit page. **Verify the QR section appears below the Publish status area.**
4. Click "Download QR". Verify:
   - A file downloads named like `event-<slugified-title>.png`.
   - File opens as a valid 512×512 PNG.
5. Scan the QR with a phone camera. Verify the URL it decodes to is exactly `http://localhost:3000/events/<that-event-id>` (or whatever the dev server origin is).
6. Open that URL in incognito → see the public event page with inline register form. ✓ end-to-end.

**Step 3: If anything fails in smoke**

Fix the cause, re-commit per the standard atomic-commit pattern, re-run gates. Do NOT skip the gate sweep.

**Step 4: Push**

```bash
git push origin main
```

Expected output: `b39596a..<new-head>  main -> main` covering Tasks 1-5 commits.

**Step 5: Update task tracking**

Mark Task #7 (Phase 3 Option A — One QR code) as completed in the TaskUpdate state.

---

## Out-of-scope reminders (do NOT add in this slice)

- No tooltip / explainer for what the QR does beyond the one-line caption.
- No "regenerate" button — every click re-generates server-side anyway.
- No QR thumbnail preview on the page (deferred per design §5 brainstorm note).
- No SVG variant (no use case yet).
- No bulk-download for multiple events.
- No edit-form UI work — that's Phase 3.5.

## Verification before completion

Per `superpowers:verification-before-completion`: do NOT claim "Phase 3 done" until:
1. All gates pass (tsc/eslint/vitest/next build).
2. Manual smoke (Step 2 above) passes end-to-end with a downloaded PNG that scans correctly.
3. All commits are pushed to origin.

If smoke fails at any step, the cause is a real bug — don't paper over it.
