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
});

describe('buildCsv', () => {
  it('joins rows with CRLF and fields with commas', () => {
    expect(buildCsv([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d\r\n');
  });

  it('escapes each field via csvEscape', () => {
    expect(buildCsv([['hello, world', 'plain']])).toBe('"hello, world",plain\r\n');
  });

  it('handles zero rows (empty string)', () => {
    expect(buildCsv([])).toBe('');
  });

  it('handles a single header row + zero data rows', () => {
    expect(buildCsv([['name', 'email']])).toBe('name,email\r\n');
  });
});
