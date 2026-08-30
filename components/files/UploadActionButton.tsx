'use client';

/**
 * BLOCK-ARCHITECTURE GATED — B6 Audit & Evidence Access is 📋 planned for
 * Stage 13 (docs/architecture/BLOCK-ARCHITECTURE.md). This file, and the rest
 * of Category 08, is library-only: no route imports it, and none should until
 * B6 ships. See docs/ui-port/CATEGORY_08_STATUS.md.
 */

import { Button } from '@/components/ui/button';

export function UploadActionButton({
  count,
  onChoose,
  disabled = false,
}: {
  count: number;
  onChoose: () => void;
  disabled?: boolean;
}) {
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={onChoose} className="gap-xs px-lg">
      <span className="material-symbols-outlined" aria-hidden>upload_file</span>
      Choose files
      {count > 0 && <span className="ml-xs rounded-full bg-primary-container px-xs text-on-primary-container">{count}</span>}
    </Button>
  );
}
