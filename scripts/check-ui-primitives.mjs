/**
 * Primitive-drift gate.
 *
 * The colour contract stops a file inventing a colour. Nothing stopped a file
 * inventing a BUTTON — so 30 files hand-rolled their own action-button chrome
 * while `components/ui/button.tsx` sat right there, and the product drifted
 * into lookalikes that no token change can ever reach at once.
 *
 * This fails the build when a raw <button> carries the signature styling of an
 * action button (a rounded, padded, or primary-filled control) instead of
 * importing the shared <Button>.
 *
 * It deliberately does NOT flag every raw <button>. A calendar day cell, a
 * listbox option and an unstyled icon toggle are not action buttons, and
 * forcing them through <Button> would be worse.
 *
 * Two escape hatches, both requiring a written reason:
 *   - whole file:  add it to ALLOWED below (for primitives that own their
 *                  own element throughout).
 *   - single site: put `ui-primitive-allow: <reason>` in a comment on or
 *                  just above the <button>. Preferred when a file mixes real
 *                  action buttons with something that only looks like one —
 *                  the justification then lives at the code it excuses.
 *
 * Both lists are meant to SHRINK. An entry without a reason is exactly the
 * drift this file exists to prevent.
 */
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.argv[2] ?? process.cwd();

/** path -> why a raw <button> is correct here. Shrink this, don't grow it. */
const ALLOWED = new Map([
  ["components/ui/button.tsx", "the primitive itself"],
  ["components/ui/toggle.tsx", "primitive; base-ui Toggle owns its own element"],
  ["components/ui/toggle-group.tsx", "primitive; base-ui ToggleGroup owns its own element"],
  ["components/ui/select.tsx", "primitive; base-ui Select owns its own trigger"],
  ["components/ui/ConfirmDialog.tsx", "shipped dialog primitive with its own locked button pair"],
  ["components/ui/toast.tsx", "shipped toast primitive; dismiss is an icon affordance, not an action button"],
  ["components/event-form/DatePicker.tsx", "calendar day cells are grid cells, not action buttons"],
  ["components/event-form/TimePicker15.tsx", "listbox options, not action buttons"],
]);

const scannedExtensions = new Set([".tsx"]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".claude", // spawned-session worktrees carry a full repo copy
  "node_modules",
  "coverage",
  "dist",
  "out",
]);

/** Chrome that means "this is styled as an action button". */
const ROUNDED = /\brounded-(?:full|lg|xl|\[)/;
const PADDED = /\b(?:px|py|p)-(?:xs|sm|md|lg|xl|\d)/;
const PRIMARY_FILL = /\bbg-primary\b/;

const violations = [];

function findButtonTags(source) {
  const tags = [];
  const opener = /<button\b/g;
  for (const match of source.matchAll(opener)) {
    // Walk to the end of the opening tag, respecting nested {…} in JSX attrs.
    let depth = 0;
    let end = match.index;
    for (let i = match.index; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    tags.push({
      index: match.index,
      text: source.slice(match.index, end + 1),
    });
  }
  return tags;
}

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
    if (ALLOWED.has(projectPath)) continue;
    if (projectPath.includes(".test.")) continue;
    // Throwaway preview routes are not product surfaces.
    if (projectPath.includes("dev-preview")) continue;
    // Archived, reference-only ports (see docs/ui-port/archive/README.md).
    if (projectPath.startsWith("docs/")) continue;

    const source = await readFile(absolutePath, "utf8");

    const lines = source.split("\n");

    for (const tag of findButtonTags(source)) {
      const isActionButton =
        PRIMARY_FILL.test(tag.text) || (ROUNDED.test(tag.text) && PADDED.test(tag.text));
      if (!isActionButton) continue;

      const line = source.slice(0, tag.index).split("\n").length;

      // Site-local opt-out: `ui-primitive-allow: <reason>` on the tag itself
      // or within the 8 lines above it (room for a wrapped, multi-line JSX
      // comment — the exact case that motivated widening this from 5).
      const window = lines.slice(Math.max(0, line - 9), line).join("\n");
      if (/ui-primitive-allow:\s*\S/.test(window) || /ui-primitive-allow:\s*\S/.test(tag.text)) {
        continue;
      }

      violations.push(`${projectPath}:${line}`);
    }
  }
}

await walk(root);

if (violations.length > 0) {
  console.error(
    `Hand-rolled action buttons found (${violations.length}).\n` +
      "Import { Button } from '@/components/ui/button' instead — or, for a\n" +
      "navigating control, style a <Link> with buttonVariants().\n" +
      "If a raw <button> is genuinely correct at one site, put a comment\n" +
      "`ui-primitive-allow: <reason>` on or just above it. If it is correct\n" +
      "throughout the file, add the file to ALLOWED in this script WITH A REASON.\n",
  );
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("UI primitive contract check passed.");
}
