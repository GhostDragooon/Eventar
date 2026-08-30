'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

export type SidebarItem = { href: string; label: string; icon: string; active?: boolean; disabled?: boolean };

export function CollapsibleSidebar({
  items,
  collapsed,
  onCollapsedChange,
}: {
  items: readonly SidebarItem[];
  collapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
}) {
  return (
    <aside className={cn('border-r border-outline-variant bg-surface-container-low transition-[width] duration-200', collapsed ? 'w-20' : 'w-64')}>
      <div className="flex min-h-16 items-center justify-between border-b border-outline-variant p-sm">
        <span className={cn('font-title-lg text-title-lg text-primary-ink', collapsed && 'sr-only')}>Eventar</span>
        <button
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          onClick={() => onCollapsedChange(!collapsed)}
          className="grid size-11 place-items-center rounded-lg text-on-surface hover:bg-surface-container-high focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <span className="material-symbols-outlined" aria-hidden>
            {collapsed ? 'menu_open' : 'left_panel_close'}
          </span>
        </button>
      </div>
      <nav aria-label="Workspace">
        <ul className="space-y-xs p-sm">
          {items.map((item) => (
            <li key={item.href}>
              {item.disabled ? (
                <span
                  aria-disabled="true"
                  aria-label={collapsed ? `${item.label} unavailable` : undefined}
                  title={`${item.label} unavailable`}
                  className="flex min-h-11 items-center gap-sm rounded-lg p-sm text-on-surface-variant opacity-50"
                >
                  <Icon item={item} />
                  {!collapsed && item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  aria-current={item.active ? 'page' : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-sm rounded-lg p-sm focus:outline-none focus:ring-2 focus:ring-primary',
                    item.active ? 'bg-primary-container text-on-primary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high',
                  )}
                >
                  <Icon item={item} />
                  {!collapsed && item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

function Icon({ item }: { item: SidebarItem }) {
  return (
    <span className="material-symbols-outlined shrink-0" aria-hidden>
      {item.icon}
    </span>
  );
}
