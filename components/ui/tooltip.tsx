'use client';

import { Tooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

/**
 * Styled hover/focus label (Ivan's motion pass, pattern 8). One provider in app/layout.tsx sets the
 * 600ms open delay; moving between triggers within 300ms opens the next one instantly.
 * The trigger keeps its own aria-label; this is the sighted label only, so never put information
 * here that is not also in the trigger's accessible name or text. Replaces the browser `title=`.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delay={600} timeout={300}>
      {children}
    </Tooltip.Provider>
  );
}

export function Tip({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-[60]">
          <Tooltip.Popup className="rounded-lg bg-on-surface px-sm py-xs font-label-md text-label-md text-surface shadow-lg transition-opacity duration-150 data-[starting-style]:opacity-0 data-[instant]:duration-0 motion-reduce:transition-none">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
