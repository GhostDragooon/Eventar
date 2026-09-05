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
        {/* User-lens 2026-09-05: this window is a marketing sample. Without a
            label a visitor arriving from the hero could mistake it for their
            own live record — LedgerWindow reads as an app screenshot. Chip goes
            in the chrome bar so it survives even a first-glance skim. */}
        <span className="ml-auto rounded-full bg-surface-container-high px-[7px] py-[1px] text-[calc(10px*var(--text-scale))] font-semibold uppercase tracking-wider text-on-surface-variant">
          Sample
        </span>
      </div>

      <div className="p-lg">
        {/* WP4 Path A — reframed from a "CPD compliance" cycle dashboard
            (which Eventar doesn't own — iCMECPD and the colleges do) to an
            Eventar-record panel showing what was released THROUGH Eventar.
            The row list is unchanged; only the header + counter change. */}
        <div className="flex items-baseline justify-between gap-sm">
          <h2 className="text-[calc(15px*var(--text-scale))] font-semibold text-on-surface">Your Eventar record</h2>
          <span className="rounded-full bg-primary-fixed px-sm py-[2px] text-[calc(11px*var(--text-scale))] font-semibold text-primary-ink">
            3 events
          </span>
        </div>
        <p className="mt-[3px] text-[calc(12px*var(--text-scale))] text-on-surface-variant">
          Dr. Chan Mei-ling · HKCR · Cycle 2024&ndash;26
        </p>

        <div className="mt-md flex items-baseline gap-sm">
          <span className="text-[calc(34px*var(--text-scale))] font-semibold leading-none text-on-surface tabular-nums">
            9.0
          </span>
          <span className="text-[calc(13px*var(--text-scale))] text-on-surface-variant">pts released through Eventar</span>
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
