/**
 * Why Eventar — three-point summary band, added 2026-08-20 at Ivan's request
 * to bring landing content closer to a reference layout he supplied.
 *
 * One photo added 2026-08-20 (Ivan supplied it): the conference-audience
 * shot, used for card 1 only as a full-bleed photo with a bottom gradient
 * scrim, matching the reference's treatment. Cards 2 and 3 stay icon-based —
 * no photo was given for them. The reference's "4.9/5 · 1,200+ Graduate
 * Reviews" stat + avatar photos is still NOT carried over — that one is
 * fabricated social proof (Eventar is pre-launch); the Hero's real stat line
 * is reused instead.
 *
 * One card shape for all three (2026-08-21, Ivan's request): icon fixed
 * top-left, text block pushed to the bottom via `mt-auto`, shared min-height —
 * card 1 was previously the only one bottom-aligned and its icon floated
 * mid-card instead of top-left like cards 2/3.
 */

import Link from 'next/link';
import { cn } from '@/lib/utils';

const POINTS = [
  {
    icon: 'school',
    title: 'Built for regulated professions',
    body: 'CME, CPD and CE for medicine, law, engineering and more — not a generic events product wearing a compliance label.',
    linkLabel: 'Browse accredited events',
    href: '/events',
    photo: { src: '/images/why-eventar-professions.jpg', alt: 'Audience seated at a professional CPD conference' },
    dark: false,
  },
  {
    icon: 'verified',
    title: 'Verify. Document. Deliver.',
    body: 'Check-in writes straight to an append-only ledger. Evidence is generated at the moment it happens, not assembled afterwards.',
    linkLabel: 'See how it works',
    href: '#how-it-works',
    photo: null,
    dark: false,
  },
  {
    icon: 'account_balance',
    title: 'The accrediting body decides',
    body: 'Eventar provides and routes the evidence. Acceptance always stays with the institution that receives it.',
    linkLabel: 'See how it works',
    href: '#how-it-works',
    photo: null,
    dark: true,
  },
] as const;

export function WhyEventar() {
  // No px-[15px] on the section below (2026-08-21, Ivan's call): the card's
  // own p-xl already provides visual inset, so the section's own padding was
  // stacking on top of it — 15+32=47px before the text, vs Hero's bare 15px.
  // Dropping it lands the text at 32px instead, keeping the card's full
  // internal padding rather than sacrificing it for an exact match.
  return (
    <section className="mx-auto mt-[46px] max-w-[1200px]">
      <div className="rounded-[18px] bg-surface-container-low p-xl">
        <div className="flex flex-wrap items-center justify-between gap-md">
          <span className="text-[calc(11px*var(--text-scale))] font-semibold uppercase tracking-[.08em] text-on-surface-variant">
            Why Eventar
          </span>
          <p className="flex flex-wrap items-center gap-xs text-[calc(12px*var(--text-scale))] text-on-surface-variant">
            Rule-aware for <b className="font-semibold text-on-surface">8 Hong Kong accrediting bodies</b>
          </p>
        </div>

        <h2 className="mt-sm text-[calc(26px*var(--text-scale))] font-semibold tracking-[-0.01em] text-on-surface">
          Simplify administration. Strengthen evidence.
        </h2>

        <div className="mt-lg grid gap-md md:grid-cols-3">
          {POINTS.map((p) => {
            const linkClass = cn(
              'mt-md inline-flex items-center gap-xs text-[calc(12.5px*var(--text-scale))] font-semibold',
              p.photo ? 'text-white' : p.dark ? 'text-inverse-primary' : 'text-primary-ink',
            );
            const linkContent = (
              <>
                {p.linkLabel}
                <span className="material-symbols-outlined text-[calc(15px*var(--text-scale))]" aria-hidden>arrow_forward</span>
              </>
            );

            return (
              <article
                key={p.title}
                className={cn(
                  'relative flex min-h-[300px] flex-col overflow-hidden rounded-[14px] p-lg',
                  p.photo
                    ? 'text-white'
                    : p.dark
                      ? 'border border-transparent bg-inverse-surface text-inverse-on-surface'
                      : 'border border-outline-variant bg-surface-container-lowest text-on-surface',
                )}
              >
                {p.photo && (
                  <>
                    {/* No negative z-index: the card (position:relative, z-index:auto)
                        doesn't establish its own stacking context, so a -z-10 child
                        escapes past the card entirely and paints behind other page
                        content instead of just behind this card's own text. Plain
                        DOM order + position:relative on the text wrapper below is
                        enough to stack it above these two. */}
                    <img src={p.photo.src} alt={p.photo.alt} className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" aria-hidden />
                  </>
                )}

                <div
                  className={cn(
                    'relative grid size-10 shrink-0 place-items-center rounded-full',
                    p.photo ? 'bg-white/15 backdrop-blur-sm' : p.dark ? 'bg-inverse-primary/15 text-inverse-primary' : 'bg-primary-container text-on-primary-container',
                  )}
                  aria-hidden
                >
                  {/* `place-items-center` centers a grid CHILD — it did nothing when
                      this element was also the icon glyph itself (a text node, not
                      a child box), which is why the glyph rendered off-center per
                      the font's own line-height metrics. Split like HowItWorks'
                      circle+glyph pair (components/landing/HowItWorks.tsx:135-138)
                      so the grid has an actual child to center. */}
                  <span className="material-symbols-outlined">{p.icon}</span>
                </div>

                <div className="relative mt-auto">
                  <h3 className="text-[calc(15px*var(--text-scale))] font-semibold leading-snug">{p.title}</h3>
                  <p className={cn('mt-sm text-[calc(13px*var(--text-scale))] leading-[1.55]', p.photo ? 'text-white/85' : p.dark ? 'text-inverse-on-surface/80' : 'text-on-surface-variant')}>
                    {p.body}
                  </p>
                  {p.href.startsWith('#') ? (
                    <a href={p.href} className={linkClass}>{linkContent}</a>
                  ) : (
                    <Link href={p.href} className={linkClass}>{linkContent}</Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
