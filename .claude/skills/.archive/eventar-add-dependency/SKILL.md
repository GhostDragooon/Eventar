---
name: eventar-add-dependency
description: Use when running pnpm add or adding a package in Eventar.
category: dependency-management
---

# Eventar: add a dependency

Eventar is a pnpm repo. Run `pnpm add <pkg>` from `~/Eventar`. It touches only `package.json` and `pnpm-lock.yaml`. Never use `npm install` here.

- Verify with `grep -n '"<pkg>"' package.json` and `git status --short package.json pnpm-lock.yaml`.
- Commit only those two paths. The tree is shared with peer sessions and carries unrelated edits.
- Animation libraries such as `motion`: the Frontend Design Standard (vault `30 — Reference/Frontend Design Standard.md`) requires a `prefers-reduced-motion` fallback. Build that fallback in the same change.
