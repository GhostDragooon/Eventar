// Ratchet: px outside borders must not grow (Ivan, 2026-11-21: text rem, layouts %, fullscreen dvh/vw, px for borders).
// Per-file counts are compared with scripts/ui-units-baseline.json. A file may only go down.
// `node scripts/check-ui-units.mjs --update` rewrites the baseline (run it after a sweep batch lowers counts).
import { readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.cwd();
const baselinePath = join(root, "scripts/ui-units-baseline.json");
const scanned = new Set([".css", ".ts", ".tsx"]);
const skipDirs = new Set(["node_modules", ".next", ".git", ".claude", "emails", "dev-preview-uiport", "dev", "scratch-demo"]);
const skipPath = [/\.test\.tsx?$/, /\/poster\/page\.tsx$/];
// Allowed px: hairlines (1px, 2px) and anything on a border, ring, outline, shadow or divide line.
const allowedLine = /\b(border|ring|outline|shadow|divide|drop-shadow|box-shadow)\b|(?:^|[\s"'`{])(?:border|ring|outline|shadow|divide)[\w-]*/i;
const pxToken = /(?<![\w.])(\d*\.?\d+)px\b/g;

async function walk(dir, out) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) await walk(join(dir, e.name), out);
    } else if (scanned.has(extname(e.name))) {
      const rel = relative(root, join(dir, e.name));
      if (!skipPath.some((p) => p.test(`/${rel}`))) out.push(rel);
    }
  }
}

const files = [];
for (const d of ["app", "components"]) await walk(join(root, d), files);

const counts = {};
for (const f of files) {
  let n = 0;
  for (const line of (await readFile(join(root, f), "utf8")).split("\n")) {
    if (allowedLine.test(line)) continue;
    for (const m of line.matchAll(pxToken)) if (m[1] !== "1" && m[1] !== "2") n++;
  }
  if (n) counts[f] = n;
}

if (process.argv.includes("--update")) {
  await writeFile(baselinePath, JSON.stringify(counts, null, 2) + "\n");
  console.log(`baseline written: ${Object.keys(counts).length} files, ${Object.values(counts).reduce((a, b) => a + b, 0)} px`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8"));
} catch {
  console.error("no baseline: run `node scripts/check-ui-units.mjs --update` once");
  process.exit(1);
}
const bad = Object.entries(counts).filter(([f, n]) => n > (baseline[f] ?? 0));
if (bad.length) {
  for (const [f, n] of bad) console.error(`${f}: ${n} px (baseline ${baseline[f] ?? 0}). Use rem, %, dvh/vw or a token.`);
  process.exit(1);
}
console.log(`check:ui-units pass (${Object.values(counts).reduce((a, b) => a + b, 0)} px, baseline ${Object.values(baseline).reduce((a, b) => a + b, 0)})`);
