'use client';

import type { Distribution } from '@/lib/analytics/countBySlug';

// One-click CSV export of the post-event review: funnel counts + every
// question's distribution. Client-side blob — the numbers are already on the
// page; no extra round-trip.
export function ExportAnalyticsCsv({
  eventTitle,
  funnel,
  questions,
}: {
  eventTitle: string;
  funnel: { registered: number; attended: number; responded: number };
  questions: { id: string; prompt: string; distribution: Distribution[] }[];
}) {
  function esc(v: string): string {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function download() {
    const lines: string[] = [];
    lines.push(['Section', 'Item', 'Count', 'Percent'].join(','));
    lines.push(['Funnel', 'Registered', String(funnel.registered), ''].join(','));
    lines.push(['Funnel', 'Attended', String(funnel.attended), ''].join(','));
    lines.push(['Funnel', 'Responded', String(funnel.responded), ''].join(','));
    for (const q of questions) {
      for (const d of q.distribution) {
        lines.push([esc(`${q.id} ${q.prompt}`), esc(d.label), String(d.count), `${d.pct}%`].join(','));
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eventar-analytics-${eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-xs bg-primary text-on-primary font-label-md text-label-md rounded-lg py-sm px-lg hover:opacity-90 transition-opacity shrink-0"
    >
      <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))]" aria-hidden>download</span>
      Export CSV
    </button>
  );
}
