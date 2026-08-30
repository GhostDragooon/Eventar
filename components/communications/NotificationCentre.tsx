'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type NotificationItem = {
  id: string;
  kind: 'notification' | 'team';
  title: string;
  body: string;
  read: boolean;
  href?: string;
};

export function NotificationCentre({
  items,
  onMarkRead,
}: {
  items: readonly NotificationItem[];
  onMarkRead: (id: string) => void;
}) {
  const [tab, setTab] = useState<'notification' | 'team'>('notification');
  const visible = items.filter((item) => item.kind === tab);

  return (
    <section className="overflow-hidden rounded-[20px] border border-outline-variant bg-surface-container-lowest">
      <div role="tablist" aria-label="Updates" className="flex border-b border-outline-variant">
        {(['notification', 'team'] as const).map((value) => (
          <button
            // ui-primitive-allow: tab control, same convention as TeamTabs
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn('min-h-11 flex-1', tab === value ? 'border-b-2 border-primary text-primary-ink' : 'text-on-surface-variant')}
          >
            {value === 'notification' ? 'Notifications' : 'Team updates'}
          </button>
        ))}
      </div>
      <ul role="tabpanel" className="divide-y divide-outline-variant">
        {visible.map((item) => (
          <li key={item.id} className={item.read ? 'p-md' : 'bg-primary-container p-md text-on-primary-container'}>
            <div className="flex items-start gap-md">
              <span className="material-symbols-outlined" aria-hidden>{item.read ? 'notifications' : 'notifications_unread'}</span>
              <div className="min-w-0 flex-1">
                <strong className="block">{item.title}</strong>
                <p className={item.read ? 'text-on-surface-variant' : 'text-on-primary-container'}>{item.body}</p>
              </div>
              {!item.read && (
                <Button type="button" variant="ghost" className="text-current" onClick={() => onMarkRead(item.id)}>Mark read</Button>
              )}
            </div>
          </li>
        ))}
        {!visible.length && <li className="p-xl text-center text-on-surface-variant">No updates.</li>}
      </ul>
    </section>
  );
}
