'use client';

import { Drawer } from '@base-ui/react/drawer';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet for menus on phones (< 768px; see lib/useIsMobile.ts).
 *
 * Built on base-ui Drawer: focus trap, Escape, scrim tap and swipe-down to
 * dismiss come with it. Slides up 250ms on the drawer curve; the transition is
 * dropped under prefers-reduced-motion. The title is for screen readers only:
 * a menu sheet needs no visible heading.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-on-surface/60 transition-opacity duration-250 ease-[cubic-bezier(0.32,0.72,0,1)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 motion-reduce:transition-none" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end">
          <Drawer.Popup
            className={cn(
              'max-h-[85dvh] w-full overflow-y-auto overscroll-contain rounded-t-[20px] border border-b-0 border-outline-variant bg-popover p-sm pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl',
              'translate-y-[var(--drawer-swipe-movement-y,0px)] transition-transform duration-250 ease-[cubic-bezier(0.32,0.72,0,1)]',
              'data-[starting-style]:translate-y-full data-[ending-style]:translate-y-full data-[swiping]:transition-none',
              'motion-reduce:transition-none',
              className,
            )}
          >
            <Drawer.Title className="sr-only">{title}</Drawer.Title>
            {children}
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
