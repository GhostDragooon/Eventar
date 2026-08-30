'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ShareLinkControl({
  label,
  url,
  qrImageSrc,
  onCopy,
}: {
  label: string;
  url: string;
  qrImageSrc?: string;
  onCopy: (value: string) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    setCopied(await onCopy(url));
  }

  return (
    <section className="rounded-[12px] border border-outline-variant bg-surface-container-lowest">
      <button
        // ui-primitive-allow: disclosure trigger, not action-button chrome — same convention as DisclosureDeleteAction
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center justify-between px-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span>{label}</span>
        <span className="material-symbols-outlined" aria-hidden>{expanded ? 'expand_less' : 'expand_more'}</span>
      </button>
      {expanded && (
        <div className="space-y-md border-t border-outline-variant p-md">
          {qrImageSrc && <img src={qrImageSrc} alt="QR code for the share link" className="mx-auto size-48 rounded-lg border border-outline-variant" />}
          <p className="break-all rounded-lg bg-surface-container p-md font-mono text-on-surface">{url}</p>
          <Button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
        </div>
      )}
    </section>
  );
}
