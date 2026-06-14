// First-name extraction for greetings.
// Splits on whitespace (per spec) so hyphenated first names like "Jane-Pierre"
// stay intact. Returns '' for nullish / empty / whitespace-only input so callers
// can safely interpolate without conditional guards.
export function firstName(fullName: string | null | undefined): string {
  if (fullName == null) return '';
  const trimmed = fullName.trim();
  if (trimmed === '') return '';
  return trimmed.split(/\s+/)[0];
}
