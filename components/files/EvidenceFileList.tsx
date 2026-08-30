/**
 * BLOCK-ARCHITECTURE GATED — see UploadActionButton.tsx header. Library-only
 * until B6 (Stage 13). `downloadHref` must be a signed, time-limited URL from
 * the host when this is wired — never a raw storage path (security boundary
 * per the source manifest: "signed download access").
 */

'use client';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type EvidenceFile = {
  id: string;
  name: string;
  sizeLabel: string;
  downloadHref?: string;
  status: 'available' | 'processing' | 'blocked';
};

export function EvidenceFileList({
  files,
  onRemove,
}: {
  files: readonly EvidenceFile[];
  onRemove?: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-outline-variant rounded-[12px] border border-outline-variant bg-surface-container-lowest">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center gap-sm p-md">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>folder_open</span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate text-on-surface">{file.name}</strong>
            <small className="text-on-surface-variant">{file.sizeLabel} · {file.status}</small>
          </span>
          {file.downloadHref && file.status === 'available' && (
            <a href={file.downloadHref} className={cn(buttonVariants({ variant: 'link' }))}>Download</a>
          )}
          {onRemove && (
            <Button type="button" variant="destructive" onClick={() => onRemove(file.id)}>Remove</Button>
          )}
        </li>
      ))}
    </ul>
  );
}
