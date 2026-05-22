'use client';

export default function PrintPosterButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      Print poster
    </button>
  );
}
