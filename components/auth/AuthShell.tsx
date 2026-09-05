import type { ReactNode } from 'react';
import { BrandMark } from '@/components/shell/BrandMark';

export function AuthShell({ title, description, children, aside }: {
  title: string;
  description: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <main className="min-h-dvh bg-surface px-grid-margin py-xl text-on-surface">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest shadow-sm lg:grid-cols-5">
        <section className="flex flex-col justify-center space-y-lg p-xl lg:col-span-3">
          <BrandMark />
          <header className="space-y-xs">
            <h1 className="font-headline-lg text-headline-lg text-on-surface">{title}</h1>
            <p className="font-body-md text-body-md text-on-surface-variant">{description}</p>
          </header>
          {children}
        </section>
        <aside className="hidden bg-primary-container p-xl text-on-primary-container lg:col-span-2 lg:flex lg:flex-col lg:justify-end">
          {aside ?? <p className="font-body-lg text-body-lg">Controlled access for authorised Eventar organizers.</p>}
        </aside>
      </div>
    </main>
  );
}
