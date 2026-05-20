/**
 * Slugify a title for use in a filename: lowercase ASCII alphanumerics with dashes.
 * Returns empty string when the input has no usable characters — caller should fall
 * back to an id-based name.
 */
export function slugifyTitle(title: string): string {
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (cleaned.length <= 60) return cleaned;

  // Try to cut at a dash within the 60-char window
  const lastDash = cleaned.lastIndexOf('-', 60);
  if (lastDash > 30) return cleaned.slice(0, lastDash);
  // Otherwise hard cut
  return cleaned.slice(0, 60).replace(/-+$/, '');
}
