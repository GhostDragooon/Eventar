// Numbered-section chrome — Design Session Log §"Section ID chips":
// accent-blue `01` `02` `03` chip + H2 + right-aligned section meta. Pending
// sections collapse to one-line stubs (§"Pending sections") — no empty cards.

export function SectionShell({
  index,
  title,
  meta,
  metaTone = 'neutral',
  children,
}: {
  index: string;
  title: string;
  meta?: React.ReactNode;
  metaTone?: 'neutral' | 'success';
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest border border-outline-variant rounded-[20px] p-lg shadow-sm mb-lg">
      <div className="flex items-center gap-sm mb-md">
        <SectionChip index={index} />
        <h2 className="text-[calc(20px*var(--text-scale))] font-extrabold tracking-[-0.025em] text-on-surface">{title}</h2>
        {meta && (
          <span
            className={`ml-auto font-label-md text-label-md normal-case tracking-normal ${
              metaTone === 'success' ? 'text-[color:var(--success)] font-semibold' : 'text-on-surface-variant'
            }`}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

export function SectionStub({
  index,
  title,
  detail,
  meta,
}: {
  index: string;
  title: string;
  detail: string;
  meta?: string;
}) {
  return (
    <section className="flex items-center gap-sm border-b border-outline-variant py-md mb-lg">
      <SectionChip index={index} muted />
      <h2 className="text-[calc(16px*var(--text-scale))] font-bold tracking-[-0.01em] text-on-surface-variant">
        {title} <span className="font-medium">· {detail}</span>
      </h2>
      {meta && (
        <span className="ml-auto font-label-md text-label-md text-on-surface-variant normal-case tracking-normal tabular-nums">
          {meta}
        </span>
      )}
    </section>
  );
}

function SectionChip({ index, muted }: { index: string; muted?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-[30px] h-[22px] rounded-md text-[calc(11px*var(--text-scale))] font-bold tabular-nums ${
        muted
          ? 'bg-surface-container-high text-on-surface-variant'
          : 'bg-primary-container text-on-primary-container'
      }`}
      aria-hidden
    >
      {index}
    </span>
  );
}
