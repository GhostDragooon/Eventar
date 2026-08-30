import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.argv[2] ?? process.cwd();
const allowedFiles = new Set([
  "app/globals.css",
  // The M3 semantic palette is designed for light-first light-and-dark
  // surfaces. The following components are intentionally OUT of that
  // system: they render an always-dark chip / big-display / scoreboard
  // regardless of the app's theme, and `bg-inverse-surface` flips to
  // #ffffff in dark mode (correct "inverse" semantics, wrong for a
  // persistent-dark surface). Adding a `--persist-dark-*` token would
  // reinvent the contract. Allowlisted, one family:
  "components/ui/toast.tsx",
  "components/details/LiveScoreboard.tsx",
  "components/details/StickyLiveBar.tsx",
  "app/events/[id]/checkin/Scoreboard.tsx",
  "app/events/[id]/analytics/page.tsx",
  // QR-code green border on the check-in confirmation — a specific
  // Tailwind arbitrary-value in one place (`border-[#4ADE80]`); the QR
  // asset expects that exact hue for accessibility contrast with common
  // camera-reader palettes. Not part of the general palette.
  "app/(public)/checkin/confirm/page.tsx",
]);
const scannedExtensions = new Set([
  ".css",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "node_modules",
  "coverage",
  "dist",
  "out",
  // Email HTML must carry inline hex colours — email clients strip CSS
  // custom properties, so the no-new-colour contract cannot apply here.
  // The gate is for UI components + surfaces, not email templates.
  "emails",
  // Orphaned agent worktrees (each session's own scratch tree). Not shipped
  // code; scanning them re-flags the same violations for every extant worktree.
  ".claude",
  // Local scratch / demo folder (gitignored), not shipped code.
  "scratch-demo",
  // Dev-only banner + preview scaffolds — either rendered only when a
  // dev-mode env var is set (dev/) or scaffolds used to eyeball design
  // ports (dev-preview-uiport/). Not shipped in production paths that the
  // colour contract targets.
  "dev-preview-uiport",
  "dev",
]);

// Path substrings that force-skip a file even if the top-level directory
// name isn't itself an ignoredDirectory. Used for cases like a print-only
// PDF poster template that lives under a normal app route but has the same
// "hex is inherent to the medium" rationale as emails/.
const ignoredPathSubstrings = [
  // Poster / PDF templates — print-oriented markup that needs baked colours
  // for PDF renderers that don't resolve CSS custom properties reliably.
  "/poster/page.tsx",
];

const colourValuePattern = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/g;
const colourVariablePattern = /--(?:color|primary|surface|border|danger|error|success|warning|info)[\w-]*\s*:/g;

const violations = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;

    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(absolutePath);
      continue;
    }

    if (!scannedExtensions.has(extname(entry.name))) continue;

    const projectPath = relative(root, absolutePath).replaceAll("\\", "/");
    if (allowedFiles.has(projectPath)) continue;
    if (ignoredPathSubstrings.some((s) => projectPath.includes(s))) continue;

    const source = await readFile(absolutePath, "utf8");

    // Strip comments before scanning — hex values that appear inside
    // documentation blocks (e.g. "the contrast of #052e16 on #1e874b is
    // 3.28:1") are annotation, not colour declarations. Newlines are
    // preserved so line numbers still map to the original file.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:/])\/\/[^\n]*/g, (_m, prefix) => prefix + " ");

    for (const pattern of [colourValuePattern, colourVariablePattern]) {
      pattern.lastIndex = 0;
      for (const match of stripped.matchAll(pattern)) {
        const line = stripped.slice(0, match.index).split("\n").length;
        violations.push(`${projectPath}:${line}: ${match[0]}`);
      }
    }
  }
}

await walk(root);

if (violations.length > 0) {
  console.error("Disallowed UI colour definitions found:\n");
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI colour contract check passed.");
}
