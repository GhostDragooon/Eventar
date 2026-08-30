import Link from 'next/link';
import { LayoutDashboardIcon, CalendarPlusIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/navigation/Breadcrumbs';

/**
 * TEMPORARY visual-diff harness (2026-08-21) — built so Ivan can see the
 * before/after of this session's three fixes side by side, since the changes
 * are small enough to be invisible in a full-page screenshot.
 *
 * Lives under dev-preview-uiport/ because that route group is already the
 * throwaway preview area (excluded from real IA, dev-only). DELETE THIS FILE
 * once the comparison has been reviewed — it renders dead "before" markup on
 * purpose and must never become a reference for how to build anything.
 *
 * The "before" halves reproduce the exact pre-fix markup/values, which are
 * recorded in this session's measurements rather than guessed:
 *   - breadcrumb: font-label-md (12px/600/0.6px tracking), text-primary-ink
 *     link, material-symbols chevron that rendered at 24px
 *   - strip gap: m-0 zeroing space-y-xl's margin-block-end -> 0px
 *   - max-w-xs: resolved to --spacing-xs = 4px
 */

function Pane({ tone, title, note, children }: { tone: 'before' | 'after'; title: string; note: string; children: React.ReactNode }) {
  const before = tone === 'before';
  return (
    <div className={`rounded-lg border p-md ${before ? 'border-[color:var(--error)]/40 bg-[color:var(--error-container)]/20' : 'border-[color:var(--success)]/40 bg-[color:var(--success-container)]/20'}`}>
      <p className={`mb-xs text-[11px] font-bold uppercase tracking-[.12em] ${before ? 'text-[color:var(--error)]' : 'text-[color:var(--success)]'}`}>
        {before ? 'Before' : 'After'} — {title}
      </p>
      <p className="mb-md text-[12px] text-on-surface-variant">{note}</p>
      <div className="rounded-md bg-surface-container-lowest p-md">{children}</div>
    </div>
  );
}

/**
 * `?s=1|2|3` renders a single section. The Browser pane this was captured with
 * loses its renderer on scroll, so each section needs to fit one viewport and
 * be reachable by a fresh navigation. No arg = all three.
 */
export default async function BreadcrumbComparePage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const show = (n: string) => !s || s === n;

  return (
    <div className="mx-auto max-w-5xl space-y-xl p-xl">
      <header>
        <h1 className="text-[28px] font-bold text-on-surface">Visual diff — 2026-08-21</h1>
        <p className="mt-xs text-[13px] text-on-surface-variant">
          Temporary harness. Delete <code>app/dev-preview-uiport/breadcrumb-compare/</code> after review.
        </p>
      </header>

      {/* ---------------- 1. Breadcrumb ---------------- */}
      <section className={show('1') ? 'space-y-md' : 'hidden'}>
        <h2 className="text-[18px] font-semibold text-on-surface">1 · Breadcrumb restyle</h2>
        <div className="grid gap-md md:grid-cols-2">
          <Pane tone="before" title="12px / 600 / blue link / 24px chevron" note="font-label-md is a LABEL token (600 weight + 0.6px tracking, meant for uppercase eyebrows). Link was #1C3C94. The chevron declared text-[16px] but rendered at 24px.">
            <nav aria-label="Breadcrumb (before)">
              <ol className="flex flex-wrap items-center gap-xs font-label-md text-label-md">
                <li className="flex items-center gap-xs">
                  <Link href="#" className="text-primary-ink hover:underline">Dashboard</Link>
                </li>
                <li className="flex items-center gap-xs">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant" aria-hidden>chevron_right</span>
                  <span className="text-on-surface">Create event</span>
                </li>
              </ol>
            </nav>
          </Pane>

          <Pane tone="after" title="14px / muted / 400 / icons / 14px chevron" note="Your Breadcrumb3 reference: icon per segment, whole trail muted, font-medium reserved for the current page, lucide SVGs (immune to the 24px font-size bug).">
            <Breadcrumbs
              items={[
                { label: 'Dashboard', href: '#', icon: LayoutDashboardIcon },
                { label: 'Create event', icon: CalendarPlusIcon },
              ]}
            />
          </Pane>
        </div>
      </section>

      {/* ---------------- 2. Progress-strip gap ---------------- */}
      <section className={show('2') ? 'space-y-md' : 'hidden'}>
        <h2 className="text-[18px] font-semibold text-on-surface">2 · Progress-strip bottom gap</h2>
        <div className="grid gap-md md:grid-cols-2">
          <Pane tone="before" title="0px gap" note="m-0 zeroed the margin-block-end that space-y-xl sets, and won because space-y's rule is :where()-wrapped (zero specificity). Every other section gap was 32px.">
            <div className="space-y-xl">
              <ol className="m-0 flex list-none items-center gap-sm rounded-lg border border-outline-variant bg-surface-container p-md text-[12px]">
                <li>1 Hero image</li><li>·</li><li>2 Basics</li>
              </ol>
              <section className="text-[14px] font-semibold text-on-surface">1 · Hero image ← flush against the strip</section>
            </div>
          </Pane>

          <Pane tone="after" title="32px gap" note="mt-0 still cancels the browser's default <ol> top margin (all m-0 was needed for) while letting space-y-xl apply its 32px bottom margin.">
            <div className="space-y-xl">
              <ol className="mt-0 flex list-none items-center gap-sm rounded-lg border border-outline-variant bg-surface-container p-md text-[12px]">
                <li>1 Hero image</li><li>·</li><li>2 Basics</li>
              </ol>
              <section className="text-[14px] font-semibold text-on-surface">1 · Hero image ← matches every other section</section>
            </div>
          </Pane>
        </div>
      </section>

      {/* ---------------- 3. max-w-xs ---------------- */}
      <section className={show('3') ? 'space-y-md' : 'hidden'}>
        <h2 className="text-[18px] font-semibold text-on-surface">3 · Category dropdown (max-w-xs)</h2>
        <div className="grid gap-md md:grid-cols-2">
          <Pane tone="before" title="max-width: 4px" note="max-w-xs fell through to --spacing-xs (4px), so the label was 4px wide and the select collapsed to the browser's 34px minimum. Inline style here reproduces the old resolved value.">
            <label className="block" style={{ maxWidth: '4px' }}>
              <span className="mb-xs block font-label-md text-label-md uppercase tracking-wider text-on-surface">
                Category <span className="normal-case text-on-surface-variant">(optional)</span>
              </span>
              <select className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-[14px] text-on-surface">
                <option>No category</option><option>Life sciences</option>
              </select>
            </label>
          </Pane>

          <Pane tone="after" title="max-width: 320px" note="Added --max-width-xs: 20rem. All 14 max-w-* keys were probed; xs was the only remaining hole in the fix globals.css already documents.">
            <label className="block max-w-xs">
              <span className="mb-xs block font-label-md text-label-md uppercase tracking-wider text-on-surface">
                Category <span className="normal-case text-on-surface-variant">(optional)</span>
              </span>
              <select className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-md py-sm text-[14px] text-on-surface">
                <option>No category</option><option>Life sciences</option>
              </select>
            </label>
          </Pane>
        </div>
      </section>
    </div>
  );
}
