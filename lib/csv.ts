/**
 * Escape a single CSV field per RFC 4180.
 * Wrap in double quotes if the field contains a comma, double quote, CR, or LF.
 * Internal double quotes are doubled.
 */
export function csvEscape(field: string): string {
  if (field === '') return '';
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * Build a CSV string from a 2D string array. Each row gets a CRLF terminator
 * (RFC 4180). Empty input returns an empty string.
 *
 * Prefixed with a UTF-8 BOM whenever there is content: Excel on Windows (the
 * default reader for every consumer of these exports, including HK College
 * administrators reading Chinese names) falls back to the system codepage
 * without one and mojibakes every non-ASCII character. Every CSV reader in
 * practice strips or ignores a leading BOM, so this is safe unconditionally.
 */
export function buildCsv(rows: string[][]): string {
  if (rows.length === 0) return '';
  return '﻿' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
}
