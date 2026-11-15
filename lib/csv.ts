/**
 * Escape a single CSV field per RFC 4180.
 * Wrap in double quotes if the field contains a comma, double quote, CR, or LF.
 * Internal double quotes are doubled.
 *
 * A leading = + - @ tab or CR makes Excel run the cell as a formula (M4, audit 2026-11-04). Anonymous registrants
 * type their own name and email, and organisers and college administrators open these exports in Excel, so such a
 * cell gets a leading apostrophe and stays text. Same rule as components/dashboard/EventsHome.tsx.
 * A signed plain number (-1.5, +2) is a number to Excel, not a formula, so it is left alone: a negative credit
 * adjustment in the College export must stay summable.
 */
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvEscape(field: string): string {
  if (field === '') return '';
  const safe = /^[=+\-@\t\r]/.test(field) && !PLAIN_NUMBER.test(field) ? `'${field}` : field;
  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
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
