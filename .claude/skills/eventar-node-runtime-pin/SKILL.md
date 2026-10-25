---
name: eventar-node-runtime-pin
description: Use when setting Eventar's Node version or engines pin.
category: dependency-management
---

# Eventar Node must be 24.22.1 or later

The 2026-10-21 Node.js security release patched 24.x at 24.22.1. Node 20 is past end-of-life and absent from that release. Eventar pins no Node version: `package.json` has no `engines` field and the repo has no `.nvmrc`.

1. Local dev: confirm `node -v` reads 24.22.1 or later in a fresh login shell before running gates.
2. Stage 8 deploy: set the Vercel project Node version to 24.22.1 or later. Ask Ivan first; the deploy is his go.
3. Adding `engines.node` or `.nvmrc` is a repo change. Propose it and wait for Ivan's approval; do not slip it into an unrelated commit.
