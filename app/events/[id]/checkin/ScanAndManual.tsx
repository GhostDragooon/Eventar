'use client';

import { useState } from 'react';
import { isValidRegistrationCode } from '@/lib/registrationCode';

/**
 * TC scan + manual row (E.4): scan SQUARE (SVG QR pictogram + accent scan
 * line) opens the existing Phase-4 html5-qrcode flow via onScanClick; the
 * manual-entry card beside it calls markAttended(code, 'manual') via
 * onManualSubmit. Both surfaces are large tap targets — the tablet is the
 * primary surface for this page.
 */
export function ScanAndManual({
  onScanClick,
  onManualSubmit,
}: {
  onScanClick: () => void;
  onManualSubmit: (code: string) => void;
}) {
  const [value, setValue] = useState('');
  const [attemptedInvalid, setAttemptedInvalid] = useState(false);
  const normalized = value.trim().toUpperCase();
  const isValid = isValidRegistrationCode(normalized);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) {
      // Enter-on-invalid bypasses the disabled button. Surface the failure
      // instead of silently returning (CLAUDE.md rule 12 — fail visibly).
      setAttemptedInvalid(true);
      return;
    }
    onManualSubmit(normalized);
    setValue('');
    setAttemptedInvalid(false);
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter">
      {/* Scan square — pictogram + animated accent scan line */}
      <button
        type="button"
        onClick={onScanClick}
        aria-label="Open camera to scan QR badge"
        className="group relative aspect-square w-full bg-surface-container-lowest rounded-[20px] border border-outline-variant overflow-hidden hover:border-primary transition-colors cursor-pointer flex flex-col items-center justify-center text-center p-md"
      >
        <ScanPictogram />
        <p className="mt-md font-title-lg text-title-lg text-on-surface">
          Scan badge
        </p>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
          Tap to open camera
        </p>
      </button>

      {/* Manual-entry card */}
      <form
        onSubmit={handleSubmit}
        className="bg-surface-container-lowest rounded-[20px] border border-outline-variant p-lg flex flex-col"
      >
        <label
          htmlFor="manual-code-input"
          className="font-label-md text-label-md uppercase text-on-surface-variant"
        >
          Manual entry
        </label>
        <p className="mt-xs font-body-md text-body-md text-on-surface-variant">
          Type the WK-XXXX code on the badge.
        </p>
        <input
          id="manual-code-input"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (attemptedInvalid) setAttemptedInvalid(false);
          }}
          placeholder="WK-XXXX"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={attemptedInvalid || undefined}
          aria-describedby={attemptedInvalid ? 'manual-code-error' : 'manual-code-hint'}
          className={`mt-md w-full rounded-lg border px-md py-md font-mono text-headline-sm uppercase tracking-wider bg-surface-container-lowest focus:outline-none focus:ring-1 ${
            attemptedInvalid
              ? 'border-danger focus:border-danger focus:ring-danger'
              : 'border-outline-variant focus:border-primary focus:ring-primary'
          }`}
        />
        {attemptedInvalid ? (
          <p
            id="manual-code-error"
            role="alert"
            className="mt-xs font-label-md text-label-md text-danger"
          >
            Enter a valid WK-XXXX code (no 0, O, 1, I, or L).
          </p>
        ) : (
          <p
            id="manual-code-hint"
            className="mt-xs font-label-md text-label-md text-on-surface-variant"
          >
            Format: WK-XXXX (no 0, O, 1, I, or L).
          </p>
        )}
        <button
          type="submit"
          disabled={!isValid}
          className="mt-md self-end min-h-11 rounded-lg bg-tertiary text-on-tertiary px-lg py-sm font-label-md text-label-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Check in
        </button>
      </form>
    </div>
  );
}

function ScanPictogram() {
  return (
    <div className="relative w-32 h-32">
      <svg
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full text-on-surface-variant"
        aria-hidden
      >
        {/* Four QR-style corner brackets */}
        <path
          d="M4 18 V4 H18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M46 4 H60 V18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M60 46 V60 H46"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M18 60 H4 V46"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        {/* Faint QR dots in the center */}
        <g fill="currentColor" opacity="0.35">
          <rect x="14" y="14" width="6" height="6" rx="1" />
          <rect x="44" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="44" width="6" height="6" rx="1" />
          <rect x="24" y="24" width="4" height="4" rx="1" />
          <rect x="32" y="32" width="6" height="6" rx="1" />
          <rect x="40" y="24" width="4" height="4" rx="1" />
          <rect x="24" y="40" width="4" height="4" rx="1" />
        </g>
      </svg>
      {/* Accent scan line — animated via Tailwind's pulse so we don't ship custom CSS */}
      <div
        aria-hidden
        className="absolute left-2 right-2 top-1/2 h-[2px] bg-primary shadow-[0_0_8px_var(--primary,currentColor)] animate-pulse"
      />
    </div>
  );
}
