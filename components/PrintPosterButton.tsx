'use client';

export default function PrintPosterButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-outline-variant px-md py-sm text-sm font-medium text-on-surface hover:bg-surface-container-high transition-colors"
    >
      Print poster
    </button>
  );
}
