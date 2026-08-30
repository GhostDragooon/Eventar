export function InlineHelpCallout({
  title,
  children,
  href,
  label = 'View guidance',
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <aside className="flex items-start gap-md rounded-[12px] bg-primary-container p-md text-on-primary-container">
      <span className="material-symbols-outlined" aria-hidden>info</span>
      <div className="min-w-0 flex-1">
        <strong className="block">{title}</strong>
        <div className="mt-xs">{children}</div>
        {href && (
          <a href={href} className="mt-sm inline-flex min-h-11 items-center font-label-md text-label-md underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-primary">
            {label}
          </a>
        )}
      </div>
    </aside>
  );
}
