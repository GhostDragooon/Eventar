// Guards a compiler bug no component test can see.
//
// Next 16.2.12's bundled SWC drops the leading space of a multi-line JSX text
// node that follows an element on the same line WHEN that text node also holds
// an HTML entity (&apos; and friends):
//
//   <strong>{email}</strong> has records     <- space kept
//   <strong>{email}</strong> has records
//     you won&apos;t see                     <- space DROPPED: "emailhas records"
//
// TypeScript's JSX transform and vitest's (esbuild) keep the space, so every
// jsdom assertion passes while the browser and a production build show
// "ux-prac-1@example.comhas practitioner records". Found live on the invite
// page (Band 1) and, pre-existing, on the account page's "verify your email"
// line. The fix at a site is an explicit {' '}.
//
// This compiles every component with both compilers and fails on a string child
// whose edge space only one of them kept. Pure, no database, a few seconds.

import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

type SwcBindings = { transform(src: string, opts: object): Promise<{ code: string }> };
const require_ = createRequire(import.meta.url);
const { loadBindings } = require_('next/dist/build/swc') as { loadBindings(): Promise<SwcBindings> };

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['app', 'components', 'emails'];

function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...componentFiles(full));
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(full);
  }
  return out;
}

function stringLiterals(js: string): Set<string> {
  const found = new Set<string>();
  for (const match of js.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) found.add(match[1]);
  return found;
}

describe('JSX text keeps its edge spaces under Next’s SWC', () => {
  it('compiles every component with the same significant spaces as TypeScript', async () => {
    const swc = await loadBindings();
    const mismatches: string[] = [];

    for (const dir of DIRS) {
      for (const file of componentFiles(path.join(ROOT, dir))) {
        const source = readFileSync(file, 'utf8');
        const viaTs = ts.transpileModule(source, {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText;
        const viaSwc = (
          await swc.transform(source, {
            filename: file,
            jsc: { parser: { syntax: 'typescript', tsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' },
          })
        ).code;

        const swcLiterals = stringLiterals(viaSwc);
        for (const literal of stringLiterals(viaTs)) {
          if (literal.length < 4 || swcLiterals.has(literal)) continue;
          const trimmed = literal.replace(/^ +| +$/g, '');
          if (trimmed !== literal && swcLiterals.has(trimmed)) {
            mismatches.push(`${path.relative(ROOT, file)}: SWC dropped an edge space of ${JSON.stringify(literal.slice(0, 60))}; add {' '}`);
          }
        }
      }
    }

    expect(mismatches).toEqual([]);
  }, 120_000);
});
