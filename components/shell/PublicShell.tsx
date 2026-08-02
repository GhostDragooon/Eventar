// Attendee-surface shell (CI pass, SV survey, LG login, PE register).
// Design Session Log §"Nav (attendee surfaces)": same three-column grid as
// the staff nav, populated for anonymous context —
//   LEFT   empty (attendees arrive from email links; no back navigation)
//   CENTER empty (no in-app sections for anonymous attendees)
//   RIGHT  optional state pill (`Pass ready` / `Checked in` / …)
// NO wordmark in the nav — brand lives in the "By Eventar" footer band.

export type PublicShellPill = {
  label: string;
  tone: 'success' | 'neutral';
};

export function PublicShell({
  children,
  pill,
}: {
  children: React.ReactNode;
  pill?: PublicShellPill;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <nav
        aria-label="Primary"
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-md border-b border-outline-variant px-grid-margin py-md text-[calc(13px*var(--text-scale))]"
      >
        <div />
        <div />
        <div className="flex items-center justify-self-end">
          {pill && (
            <span
              className={`inline-flex items-center gap-xs px-sm py-[3px] rounded-full text-[calc(11px*var(--text-scale))] font-semibold ${
                pill.tone === 'success'
                  ? 'bg-success-container text-on-success-container'
                  : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              <span
                className={`w-[6px] h-[6px] rounded-full ${
                  pill.tone === 'success' ? 'bg-[color:var(--success)]' : 'bg-outline'
                }`}
                aria-hidden
              />
              {pill.label}
            </span>
          )}
        </div>
      </nav>

      <main className="flex-1 w-full">{children}</main>

      <footer className="w-full border-t border-outline-variant bg-surface-container-lowest py-md text-center">
        <span className="text-[calc(11px*var(--text-scale))] text-on-surface-variant">
          By <span className="font-bold text-on-surface">Eventar</span>
        </span>
      </footer>
    </div>
  );
}
