'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type RecordAction = {
  id: string;
  label: string;
  description: string;
  icon: string;
  destructive?: boolean;
  disabled?: boolean;
};

export function RecordActionsMenu({
  actions,
  onAction,
}: {
  actions: readonly RecordAction[];
  onAction: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Record actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="material-symbols-outlined" aria-hidden>more_vert</span>
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-xs w-72 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-xs shadow-lg">
          {actions.map((action) => (
            <button
              // ui-primitive-allow: menu item inside an open RecordActionsMenu
              // popover, not a standalone action — same convention as
              // WorkspaceSwitcher's listbox options.
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                onAction(action.id);
                setOpen(false);
              }}
              className={`flex min-h-14 w-full items-start gap-sm rounded-lg p-sm text-left hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
                action.destructive ? 'text-error' : 'text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined" aria-hidden>{action.icon}</span>
              <span>
                <strong className="block">{action.label}</strong>
                <small className={action.destructive ? 'text-on-error-container' : 'text-on-surface-variant'}>
                  {action.description}
                </small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
