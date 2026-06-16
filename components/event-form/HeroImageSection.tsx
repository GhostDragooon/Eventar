'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Wave 3 — hero background uploader. Uploads directly to the
// event-hero-images bucket via the browser Supabase client (authenticated
// staff session). Server-side validation lives on the bucket (size + MIME
// whitelist via storage.buckets) + RLS (staff-only write).
//
// File naming: `pending/{timestamp}-{rand}.{ext}` for create-mode (event
// id unknown yet); `{eventId}/{timestamp}-{rand}.{ext}` for edit-mode.
// Old images aren't deleted on replace — a follow-up cleanup task can
// sweep orphans by joining storage.objects against events.hero_image_url.

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'event-hero-images';

type Props = {
  value: string;
  onChange: (url: string) => void;
  eventId?: string;
};

export function HeroImageSection({ value, onChange, eventId }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Image must be JPEG, PNG, or WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`Image must be under ${Math.round(MAX_BYTES / 1024 / 1024)}MB.`);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const safeExt = /^(jpe?g|png|webp)$/.test(ext) ? ext : 'jpg';
      const stamp = Date.now();
      const rand = Math.random().toString(36).slice(2, 8);
      const path = `${eventId ?? 'pending'}/${stamp}-${rand}.${safeExt}`;
      const supabase = supabaseBrowser();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) {
        setError(`Upload failed: ${upErr.message}`);
        return;
      }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-sm">
      <div className="block font-label-md text-label-md uppercase tracking-wider text-on-surface">
        Hero image (optional)
      </div>
      <p className="font-body-md text-body-md text-on-surface-variant m-0">
        Shows behind the event title on the public page. JPEG / PNG / WebP, up to 5MB.
      </p>

      {value ? (
        <div className="relative overflow-hidden rounded-lg border border-outline-variant">
          {/* eslint-disable-next-line @next/next/no-img-element -- public storage URL */}
          <img
            src={value}
            alt="Event hero preview"
            className="w-full h-48 object-cover"
          />
          <div className="flex items-center justify-between bg-surface-container-lowest border-t border-outline-variant p-sm">
            <span className="font-body-md text-body-md text-on-surface-variant truncate flex-1 min-w-0">
              {value.split('/').slice(-2).join('/')}
            </span>
            <div className="flex gap-xs">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange('')}
                disabled={uploading}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          <span className="material-symbols-outlined text-[18px] mr-xs" aria-hidden>
            image
          </span>
          {uploading ? 'Uploading…' : 'Upload hero image'}
        </Button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />

      {error && (
        <p
          role="alert"
          className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
