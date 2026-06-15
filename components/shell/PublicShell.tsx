/**
 * Public-facing shell for anon-accessible routes: /events/[id] (register),
 * /checkin/confirm, /login. Minimal: NO top branding (M3), single-line
 * "By Eventar" footer (§2).
 *
 * Patterns: docs/plans/eventar-design-patterns.md §2 (uniform footer),
 * §3/§5 (rhythm). The content slot inherits the 480px column from each
 * page's own container — the shell only provides the page chrome.
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <main className="flex-1 w-full">{children}</main>

      <footer className="w-full py-lg text-center">
        <span className="font-sans text-[12px] font-medium tracking-wide text-on-surface-variant">
          By Eventar
        </span>
      </footer>
    </div>
  );
}
