'use client';

import Link from 'next/link';

export type PinnedItem = { id: string; label: string; href: string };

export function PinnedItemsList({
  items,
  onMove,
  onRemove,
}: {
  items: readonly PinnedItem[];
  onMove: (id: string, direction: 'up' | 'down') => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ol className="divide-y divide-outline-variant rounded-[12px] border border-outline-variant bg-surface-container-lowest">
      {items.map((item, index) => (
        <li key={item.id} className="flex min-h-14 items-center gap-sm p-sm">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>
            drag_indicator
          </span>
          <Link href={item.href} className="min-w-0 flex-1 truncate text-on-surface hover:underline focus:outline-none focus:ring-2 focus:ring-primary">
            {item.label}
          </Link>
          <button
            type="button"
            aria-label={`Move ${item.label} up`}
            disabled={index === 0}
            onClick={() => onMove(item.id, 'up')}
            className="grid size-11 place-items-center rounded-lg text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
          >
            ↑
          </button>
          <button
            type="button"
            aria-label={`Move ${item.label} down`}
            disabled={index === items.length - 1}
            onClick={() => onMove(item.id, 'down')}
            className="grid size-11 place-items-center rounded-lg text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
          >
            ↓
          </button>
          <button
            type="button"
            aria-label={`Remove ${item.label}`}
            onClick={() => onRemove(item.id)}
            className="grid size-11 place-items-center rounded-lg text-error hover:bg-error-container focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <span className="material-symbols-outlined" aria-hidden>
              close
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
