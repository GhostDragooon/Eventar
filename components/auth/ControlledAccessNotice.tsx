export function ControlledAccessNotice({ contactLabel = 'Contact an administrator' }: { contactLabel?: string }) {
  return (
    <section className="rounded-[12px] border border-outline-variant bg-surface-container p-md">
      <div className="flex items-start gap-sm">
        <span className="material-symbols-outlined text-primary-ink" aria-hidden>lock</span>
        <div className="space-y-xs">
          <h2 className="font-title-lg text-title-lg text-on-surface">Staff access only</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Access is limited to authorised staff records. Signing in does not grant a new role or change an existing permission.
          </p>
          <p className="font-label-md text-label-md text-primary-ink">{contactLabel}</p>
        </div>
      </div>
    </section>
  );
}
