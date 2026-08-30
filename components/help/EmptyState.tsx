export function EmptyState({
  icon = 'inbox',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-dashed border-outline bg-surface-container-low p-xl text-center">
      <span className="material-symbols-outlined text-[40px] text-on-surface-variant" aria-hidden>{icon}</span>
      <h2 className="mt-md font-title-lg text-title-lg text-on-surface">{title}</h2>
      <p className="mt-xs font-body-md text-body-md text-on-surface-variant">{description}</p>
      {action && <div className="mt-md flex justify-center">{action}</div>}
    </section>
  );
}
