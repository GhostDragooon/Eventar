'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ToggleCountButton({
  label,
  pressed,
  count,
  onChange,
}: {
  label: string;
  pressed: boolean;
  count: number;
  onChange: (pressed: boolean) => void;
}) {
  return (
    <Button
      type="button"
      variant={pressed ? 'default' : 'outline'}
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className="gap-xs px-md"
    >
      <span className={cn('material-symbols-outlined', pressed && '[font-variation-settings:"FILL"_1]')} aria-hidden>
        bookmark
      </span>
      {label} <span className="ml-xs">{count}</span>
    </Button>
  );
}
