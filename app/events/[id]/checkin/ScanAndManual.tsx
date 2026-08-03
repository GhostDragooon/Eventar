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
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-grid-gutter items-stretch">
      {/* Scan — the receptionist's PRIMARY action (locked TC spec): dominant
          blue CTA, compact horizontal card instead of a giant empty square. */}
      <button
        type="button"
        onClick={onScanClick}
        aria-label="Open camera to scan QR badge"
        className="group relative w-full min-h-[132px] bg-primary text-on-primary rounded-[20px] overflow-hidden hover:opacity-95 transition-opacity cursor-pointer flex items-center justify-center gap-lg px-lg py-md text-left"
      >
        <ScanPictogram />
        <span>
          <span className="block text-[calc(20px*var(--text-scale))] font-extrabold tracking-[-0.02em]">Scan badge</span>
          <span className="block mt-xs font-body-md text-body-md text-white/75">Tap to open the camera</span>
        </span>
      </button>

      {/* Manual entry — secondary affordance, tight inline form. */}
      <form
        onSubmit={handleSubmit}
        className="bg-surface-container-lowest rounded-[20px] border border-outline-variant px-lg py-md flex flex-col justify-center"
      >
        <label
          htmlFor="manual-code-input"
          className="font-label-md text-label-md uppercase text-on-surface-variant"
        >
          Or enter the code manually
        </label>
        <input
          id="manual-code-input"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (attemptedInvalid) setAttemptedInvalid(false);
          }}
          placeholder="WK-XXXXXX"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={attemptedInvalid || undefined}
          aria-describedby={attemptedInvalid ? 'manual-code-error' : 'manual-code-hint'}
          className={`mt-sm w-full rounded-lg border px-md py-sm font-mono text-[calc(22px*var(--text-scale))] uppercase tracking-[0.12em] bg-surface-container-lowest focus:outline-none focus:ring-1 ${
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
            Enter a valid WK- code (no 0, O, 1, I, or L).
          </p>
        ) : (
          <p
            id="manual-code-hint"
            className="mt-xs font-label-md text-label-md text-on-surface-variant"
          >
            Format: WK- plus 6 characters (no 0, O, 1, I, or L).
          </p>
        )}
        <button
          type="submit"
          disabled={!isValid}
          className="mt-sm self-end min-h-11 rounded-lg border border-outline-variant bg-surface-container-high text-on-surface px-lg py-sm font-label-md text-label-md hover:bg-surface-container-highest disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Check in →
        </button>
      </form>
    </div>
  );
}

function ScanPictogram() {
  return (
    <div className="relative w-16 h-16 shrink-0">
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
