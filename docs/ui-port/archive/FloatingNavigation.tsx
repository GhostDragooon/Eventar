'use client';

import { useState } from 'react';
import Link from 'next/link';

export type NavigationGroup = { label: string; links: readonly { label: string; href: string; description?: string }[] };

export function FloatingNavigation({
  groups,
  primaryAction,
}: {
  groups: readonly NavigationGroup[];
  primaryAction: { label: string; href: string };
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-sm z-40 mx-auto max-w-6xl px-grid-margin">
      <div className="flex min-h-16 items-center justify-between rounded-[20px] border border-outline-variant bg-surface-container-lowest px-md shadow-sm">
        <Link href="/" className="font-title-lg text-title-lg text-primary-ink focus:outline-none focus:ring-2 focus:ring-primary">
          Eventar
        </Link>
        <nav className="hidden items-center gap-md lg:flex" aria-label="Primary">
          {groups.map((group) => (
            <div key={group.label} className="group relative">
              <button type="button" className="min-h-11 px-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary">
                {group.label}
              </button>
              <div className="invisible absolute left-1/2 top-full w-80 -translate-x-1/2 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-sm opacity-0 shadow-lg transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                {group.links.map((link) => (
                  <Link key={link.href} href={link.href} className="block rounded-lg p-md hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary">
                    <strong className="block text-on-surface">{link.label}</strong>
                    {link.description && <span className="text-on-surface-variant">{link.description}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-sm">
          <Link
            href={primaryAction.href}
            className="hidden min-h-11 items-center rounded-lg bg-primary px-lg text-on-primary focus:outline-none focus:ring-2 focus:ring-primary sm:flex"
          >
            {primaryAction.label}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-navigation"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
            className="grid size-11 place-items-center rounded-lg text-on-surface focus:outline-none focus:ring-2 focus:ring-primary lg:hidden"
          >
            <span className="material-symbols-outlined" aria-hidden>
              {open ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-navigation" aria-label="Mobile primary" className="mt-xs rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md shadow-lg lg:hidden">
          {groups.map((group) => (
            <section key={group.label} className="py-sm">
              <h2 className="font-label-md text-label-md uppercase text-on-surface-variant">{group.label}</h2>
              {group.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block min-h-11 rounded-lg p-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {link.label}
                </Link>
              ))}
            </section>
          ))}
        </nav>
      )}
    </header>
  );
}
