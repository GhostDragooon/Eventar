'use client';

import { useState } from 'react';

/**
 * DISPUTED SHAPE — flagged for Ivan, not silently resolved.
 *
 * The source pattern is a joined rectangle (primary action + adjoined caret,
 * sharing one border). The repo's locked shape rule (2026-08-08,
 * components/ui/button.tsx) is "ACTIONS are full-pill" — <Button> cannot
 * render a joined-rectangle pair without breaking that rule. Kept as raw
 * buttons in the source shape rather than forcing either a pill reinterpretation
 * (loses the joined "one control" reading) or silently exempting this file from
 * the shape rule. No live route currently needs a split action, so nothing
 * downstream depends on the resolution yet.
 */

export type SplitAction = { id: string; label: string; disabled?: boolean };

export function SplitActionButton({
  primaryLabel,
  actions,
  onAction,
}: {
  primaryLabel: string;
  actions: readonly SplitAction[];
  onAction: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-flex">
      {/* ui-primitive-allow: joined split-button shape, see file header — disputed against the pill shape rule */}
      <button
        type="button"
        onClick={() => onAction('primary')}
        className="min-h-11 rounded-l-lg bg-primary px-lg text-on-primary focus:z-10 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {primaryLabel}
      </button>
      {/* ui-primitive-allow: joined split-button shape, see file header */}
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid min-h-11 min-w-11 place-items-center rounded-r-lg border-l border-on-primary bg-primary text-on-primary focus:z-10 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="material-symbols-outlined" aria-hidden>expand_more</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-xs min-w-52 rounded-[12px] border border-outline-variant bg-surface-container-lowest p-xs shadow-lg">
          {actions.map((action) => (
            // ui-primitive-allow: menu item inside an open popover, not a standalone action
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                onAction(action.id);
                setOpen(false);
              }}
              className="min-h-11 w-full rounded-lg px-md text-left text-on-surface hover:bg-surface-container focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
