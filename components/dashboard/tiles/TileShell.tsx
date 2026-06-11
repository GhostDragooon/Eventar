export function TileShell({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[20px] p-lg border border-outline-variant shadow-sm flex flex-col justify-between min-h-[160px]">
      <div className="flex justify-between items-start">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase">
          {label}
        </h3>
        <span
          className="material-symbols-outlined text-primary bg-primary-container p-xs rounded-md"
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div>{children}</div>
    </div>
  );
}
