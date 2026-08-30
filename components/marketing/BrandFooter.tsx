/**
 * DO NOT WIRE — see docs/ui-port/CATEGORY_12_STATUS.md. Duplicates
 * components/shell/SiteFooter.tsx, the locked "one footer, used by every
 * shell" (2026-08-09). Ported for completeness only.
 */

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type FooterGroup = { label: string; links: readonly { label: string; href: string }[] };

export function BrandFooter({
  description,
  groups,
  contact,
  legal,
}: {
  description: string;
  groups: readonly FooterGroup[];
  contact?: { label: string; href: string };
  legal: readonly { label: string; href: string }[];
}) {
  return (
    <footer className="bg-inverse-surface px-grid-margin py-xxl text-inverse-on-surface">
      <div className="mx-auto grid max-w-7xl gap-xl lg:grid-cols-4">
        <section>
          <Link href="/" className="font-title-lg text-title-lg text-inverse-primary focus:outline-none focus:ring-2 focus:ring-primary">Eventar</Link>
          <p className="mt-sm text-inverse-on-surface">{description}</p>
          {contact && <Link href={contact.href} className={cn(buttonVariants({ variant: 'default' }), 'mt-md px-lg')}>{contact.label}</Link>}
        </section>
        {groups.map((group) => (
          <nav key={group.label} aria-label={group.label}>
            <h2 className="font-label-md text-label-md uppercase text-inverse-primary">{group.label}</h2>
            <ul className="mt-sm space-y-sm">
              {group.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-inverse-on-surface hover:underline focus:outline-none focus:ring-2 focus:ring-primary">{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-xl flex max-w-7xl flex-wrap justify-between gap-md border-t border-outline pt-md">
        <span>© Eventar</span>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-md">
            {legal.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:underline focus:outline-none focus:ring-2 focus:ring-primary">{link.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
