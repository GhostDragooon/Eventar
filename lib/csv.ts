/**
 * Escape a single CSV field per RFC 4180.
 * Wrap in double quotes if the field contains a comma, double quote, or newline.
 * Internal double quotes are doubled.
 */
export function csvEscape(field: string): string {
  if (field === '') return '';
  if (/[",\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Build a CSV string from a 2D string array. Each row gets a CRLF terminator
 * (RFC 4180). Empty input returns an empty string.
 */
export function buildCsv(rows: string[][]): string {
  if (rows.length === 0) return '';
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
