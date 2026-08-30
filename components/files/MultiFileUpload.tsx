'use client';

/**
 * BLOCK-ARCHITECTURE GATED — see UploadActionButton.tsx header. Library-only
 * until B6 (Stage 13).
 *
 * Security boundary (source manifest, "Client restrictions are usability
 * checks only"): the maxFiles/maxBytes checks below are UX guidance, not
 * enforcement. Whatever Server Action eventually consumes `onSubmit` must
 * re-validate type, size, count and content itself, and must not trust the
 * File objects' name or browser-reported MIME type.
 */

import { useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';

export type SelectedFile = { id: string; file: File };

export function MultiFileUpload({
  files,
  onChange,
  accept,
  maxFiles = 10,
  maxBytes,
  onSubmit,
  pending = false,
  error,
}: {
  files: readonly SelectedFile[];
  onChange: (files: SelectedFile[]) => void;
  accept?: string;
  maxFiles?: number;
  maxBytes?: number;
  onSubmit: () => void;
  pending?: boolean;
  error?: string | null;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function add(list: FileList | null) {
    if (!list) return;
    const incoming = [...list];
    if (files.length + incoming.length > maxFiles) {
      setLocalError(`Select no more than ${maxFiles} files.`);
      return;
    }
    if (maxBytes && incoming.some((file) => file.size > maxBytes)) {
      setLocalError('One or more files exceed the permitted size.');
      return;
    }
    setLocalError(null);
    onChange([...files, ...incoming.map((file) => ({ id: crypto.randomUUID(), file }))]);
  }

  function remove(id: string) {
    onChange(files.filter((item) => item.id !== id));
  }

  return (
    <section className="space-y-md rounded-[20px] border border-outline-variant bg-surface-container-lowest p-lg">
      <input ref={inputRef} id={inputId} type="file" multiple accept={accept} onChange={(event) => add(event.target.files)} className="sr-only" />
      <button
        // ui-primitive-allow: dashed drop-zone affordance, not action-button chrome
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex min-h-40 w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-outline bg-surface-container-low p-lg text-center text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span className="material-symbols-outlined text-[32px] text-primary-ink" aria-hidden>cloud_upload</span>
        <strong>Choose evidence files</strong>
        <span className="text-on-surface-variant">Up to {maxFiles} files. The host defines accepted types and size limits.</span>
      </button>
      {files.length > 0 && (
        <ul className="divide-y divide-outline-variant" aria-label="Selected files">
          {files.map((item) => (
            <li key={item.id} className="flex items-center gap-sm py-sm">
              <span className="material-symbols-outlined text-on-surface-variant" aria-hidden>description</span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-on-surface">{item.file.name}</strong>
                <small className="text-on-surface-variant">{formatBytes(item.file.size)}</small>
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-11 text-error" aria-label={`Remove ${item.file.name}`} onClick={() => remove(item.id)}>
                <span className="material-symbols-outlined" aria-hidden>close</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {(localError || error) && <p role="alert" className="rounded-[12px] bg-error-container p-md text-on-error-container">{localError || error}</p>}
      <div className="flex justify-end">
        <Button type="button" disabled={!files.length || pending} onClick={onSubmit}>
          {pending ? 'Submitting…' : 'Submit files'}
        </Button>
      </div>
    </section>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
