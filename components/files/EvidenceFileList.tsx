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
    <ul className="divide-y divide-outline-variant rounded-control border border-outline-variant bg-surface-container-lowest">
      {files.map((file) => (
        <li key={file.id} className="flex flex-wrap items-center gap-sm p-md">
          <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>folder_open</span>
          <span className="min-w-0 flex-1">
            <strong className="flex min-w-0 text-on-surface" title={file.name}>
              <span className="min-w-0 truncate">{base(file.name)}</span>
              <span className="shrink-0">{ext(file.name)}</span>
            </strong>
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

// Middle truncation: the base shrinks with an ellipsis, the extension stays whole.
const dotAt = (n: string) => n.lastIndexOf('.');
const base = (n: string) => (dotAt(n) > 0 ? n.slice(0, dotAt(n)) : n);
const ext = (n: string) => (dotAt(n) > 0 ? n.slice(dotAt(n)) : '');
