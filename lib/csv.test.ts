import { describe, expect, it } from 'vitest';
import { csvEscape, buildCsv } from './csv';

describe('csvEscape', () => {
  it('returns plain field unchanged', () => {
    expect(csvEscape('hello')).toBe('hello');
  });

  it('quotes fields containing commas', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles internal double quotes', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
  });

  it('quotes fields with newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });

  it('quotes fields with all three special chars', () => {
    expect(csvEscape('a, "b"\nc')).toBe('"a, ""b""\nc"');
  });

  it('escapes empty string as empty (no quotes)', () => {
    expect(csvEscape('')).toBe('');
  });

  it('quotes fields with bare CR (Windows clipboard paste)', () => {
    expect(csvEscape('a\rb')).toBe('"a\rb"');
  });

  it('quotes fields with CRLF', () => {
    expect(csvEscape('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('csvEscape formula injection (M4, audit 2026-11-04)', () => {
  it.each(['=1+1', '+1+1', '-1+1', '@SUM(A1)', '\t=1+1', '\r=1+1'])('prefixes an apostrophe to a cell starting %j', (cell) => {
    const out = csvEscape(cell);
    expect(out.replace(/^"|"$/g, '').startsWith("'")).toBe(true);
  });

  it('prefixes the apostrophe before quoting, so a formula with a comma stays one inert cell', () => {
    expect(csvEscape('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
  });

  // A signed plain number is a number to Excel, not a formula; a negative credit adjustment must stay summable
  // (dev-lens M2: credit_ledger allows credit_adjusted / credit_revoked rows with negative points or hours).
  it.each(['-1.5', '+2', '-3', '0.25'])('leaves the plain number %j untouched', (cell) => {
    expect(csvEscape(cell)).toBe(cell);
  });

  it.each(['-1.5.2', '+1 ', '-1 2', '-1+1', '+1+1'])('still prefixes %j: it is not a plain number', (cell) => {
    expect(csvEscape(cell).replace(/^"|"$/g, '').startsWith("'")).toBe(true);
  });

  it('leaves a formula character that is not first alone', () => {
    expect(csvEscape('a=b')).toBe('a=b');
    expect(csvEscape('Smith-Jones')).toBe('Smith-Jones');
  });
});

describe('buildCsv', () => {
  it('joins rows with CRLF and fields with commas', () => {
    expect(buildCsv([['a', 'b'], ['c', 'd']])).toBe('﻿a,b\r\nc,d\r\n');
  });

  it('escapes each field via csvEscape', () => {
    expect(buildCsv([['hello, world', 'plain']])).toBe('﻿"hello, world",plain\r\n');
  });

  it('handles zero rows (empty string, no BOM — nothing to open)', () => {
    expect(buildCsv([])).toBe('');
  });

  it('handles a single header row + zero data rows', () => {
    expect(buildCsv([['name', 'email']])).toBe('﻿name,email\r\n');
  });

  it('preserves empty fields between populated fields', () => {
    expect(buildCsv([['a', '', 'b']])).toBe('﻿a,,b\r\n');
  });

  it('prefixes a UTF-8 BOM so Excel on Windows renders non-ASCII text correctly', () => {
    expect(buildCsv([['陳大文', 'HKCP']]).startsWith('﻿')).toBe(true);
  });
});
