import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import process from "node:process";

const root = process.argv[2] ?? process.cwd();
const allowedFiles = new Set([
  "app/globals.css",
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
]);

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

    const source = await readFile(absolutePath, "utf8");

    for (const pattern of [colourValuePattern, colourVariablePattern]) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split("\n").length;
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
