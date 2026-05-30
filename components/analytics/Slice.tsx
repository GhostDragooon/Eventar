import type { ReactNode } from 'react';

type IconBgVariant = 'fixed' | 'secondary-container' | 'tertiary-fixed' | 'primary-container' | 'primary';

const iconBgClasses: Record<IconBgVariant, string> = {
  'fixed': 'bg-primary-fixed text-primary',
  'secondary-container': 'bg-secondary-container text-on-secondary-container',
  'tertiary-fixed': 'bg-tertiary-fixed text-tertiary',
  'primary-container': 'bg-primary-container text-on-primary',
  'primary': 'bg-primary text-on-primary',
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
      className={`flex flex-col md:flex-row items-center gap-lg p-lg ${
        borderBottom ? 'border-b border-outline-variant' : ''
      } hover:bg-surface-container-low/30 transition-colors ${bgClass ?? ''}`}
    >
      <div className="w-full md:w-1/3 flex items-start gap-md">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBgClasses[iconBg]}`}>
          <span className="material-symbols-outlined" aria-hidden>
            {icon}
          </span>
        </div>
        <div>
          <h2 className="font-headline-sm text-title-lg text-on-surface leading-none pt-1.5">{title}</h2>
          <p className="text-body-md text-on-surface-variant italic mt-sm pr-md">{prompt}</p>
        </div>
      </div>
      <div className="w-full md:w-2/3 flex items-center gap-xl">{children}</div>
    </div>
  );
}
