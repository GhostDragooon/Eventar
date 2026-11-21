'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet } from '@/components/ui/Sheet';
import { useIsMobile } from '@/lib/useIsMobile';

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
  const mobile = useIsMobile();

  const menu = (
    <div role="menu">
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
              className={`flex min-h-14 w-full items-start gap-sm rounded-md p-sm text-left hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
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
  );

  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Record actions"
        aria-haspopup={mobile ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="material-symbols-outlined" aria-hidden>more_vert</span>
      </Button>
      {open && !mobile && (
        <div className="absolute right-0 z-30 mt-xs w-72 origin-top-right animate-overlay-in rounded-control border border-outline-variant bg-popover p-xs shadow-lg">
          {menu}
        </div>
      )}
      {mobile && (
        <Sheet open={open} onOpenChange={setOpen} title="Record actions">
          {menu}
        </Sheet>
      )}
    </div>
  );
}
