/**
 * The product "in-frame" — the artifact's `.miniwin`, a browser window showing
 * a real CPD Ledger rather than an abstract illustration.
 *
 * Static by design: this is a marketing still, not a live view. The real ledger
 * is the practitioner surface. Numbers match the artifact exactly so the
 * screenshot and the app never disagree in a demo.
 *
 * Moved into the Hero's right column 2026-08-20 (was full-width below the
 * hero with a heavy overlap into the next section) — the traffic-light dots
 * stay as a browser-chrome cue, but the fake "app.eventar.hk/ledger" address
 * bar text was dropped at Ivan's request.
 */

const ROWS = [
  { kind: 'Scanned', title: 'Advances in Interventional Radiology', pts: '+6.0' },
  { kind: 'Scanned', title: 'MRI Safety & Governance Workshop', pts: '+3.0' },
  { kind: 'Self-reported', title: 'Journal club — awaiting evidence', pts: '+2.0' },
] as const;

export function LedgerWindow() {
  return (
    <div className="ledger-window relative z-[2] w-full overflow-hidden rounded-[22px] bg-surface-container-lowest text-left">
      <div className="flex items-center gap-sm border-b border-outline-variant bg-surface-container-low px-md py-sm">
        <i className="block h-[9px] w-[9px] rounded-full bg-outline" aria-hidden />
        <i className="block h-[9px] w-[9px] rounded-full bg-outline" aria-hidden />
        <i className="block h-[9px] w-[9px] rounded-full bg-outline" aria-hidden />
      </div>

      <div className="p-lg">
        <div className="flex items-baseline justify-between gap-sm">
          <h2 className="text-[calc(15px*var(--text-scale))] font-semibold text-on-surface">Your CPD compliance</h2>
          <span className="rounded-full bg-success-container px-sm py-[2px] text-[calc(11px*var(--text-scale))] font-semibold text-[color:var(--success)]">
            On track
          </span>
        </div>
        <p className="mt-[3px] text-[calc(12px*var(--text-scale))] text-on-surface-variant">
          Dr. Chan Mei-ling · HKCR · Cycle 2024&ndash;26
        </p>

        <div className="mt-md flex items-baseline gap-sm">
          <span className="text-[calc(34px*var(--text-scale))] font-semibold leading-none text-on-surface tabular-nums">
            71
          </span>
          <span className="text-[calc(13px*var(--text-scale))] text-on-surface-variant">of 90 pts</span>
        </div>
        <div className="mt-sm h-[9px] overflow-hidden rounded-full bg-surface-container-high">
          <div className="h-full rounded-full bg-primary" style={{ width: '79%' }} />
        </div>

        <ul className="mt-md divide-y divide-outline-variant">
          {ROWS.map((r) => (
            <li key={r.title} className="flex items-center gap-sm py-sm">
              {/* Provenance first — the artifact treats "how was this witnessed"
                  as the ledger's primary distinction, not a footnote. */}
              <span
                className={`rounded-md px-sm py-[2px] text-[calc(10px*var(--text-scale))] font-bold ${
                  r.kind === 'Scanned'
                    ? 'bg-success-container text-success'
                    : 'bg-warning-container text-warning'
                }`}
              >
                {r.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-[calc(13px*var(--text-scale))] text-on-surface">
                {r.title}
              </span>
              <span className="font-mono text-[calc(13px*var(--text-scale))] font-bold text-on-surface tabular-nums">
                {r.pts}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
