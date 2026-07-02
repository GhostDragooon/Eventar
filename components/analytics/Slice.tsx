import type { ReactNode } from 'react';

type IconBgVariant = 'fixed' | 'secondary-container' | 'tertiary-fixed' | 'primary-container' | 'primary';

// Workstation pass: ONE icon treatment across every slice — the per-slice
// color variants read as decoration, not meaning (locked: decorative color
// is forbidden). The variant prop is kept for call-site compatibility.
const iconBgClasses: Record<IconBgVariant, string> = {
  'fixed': 'bg-primary-container text-on-primary-container',
  'secondary-container': 'bg-primary-container text-on-primary-container',
  'tertiary-fixed': 'bg-primary-container text-on-primary-container',
  'primary-container': 'bg-primary-container text-on-primary-container',
  'primary': 'bg-primary-container text-on-primary-container',
};

export function Slice({
  icon,
  iconBg,
  title,
  prompt,
  children,
  bgClass,
  borderBottom = true,
}: {
  icon: string; // material-symbols-outlined name
  iconBg: IconBgVariant;
  title: string;
  prompt: string;
  children: ReactNode;
  bgClass?: string;
  borderBottom?: boolean;
}) {
  return (
    <div
      className={`flex flex-col md:flex-row md:items-start gap-md px-lg py-md ${
        borderBottom ? 'border-b border-outline-variant' : ''
      } ${bgClass ?? ''}`}
    >
      <div className="w-full md:w-1/3 flex items-start gap-sm">
        <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${iconBgClasses[iconBg]}`}>
          <span className="material-symbols-outlined text-[18px]" aria-hidden>
            {icon}
          </span>
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-on-surface leading-tight pt-1">{title}</h2>
          <p className="text-[12px] text-on-surface-variant mt-[2px] pr-md leading-snug">{prompt}</p>
        </div>
      </div>
      <div className="w-full md:w-2/3 flex items-center gap-xl">{children}</div>
    </div>
  );
}
