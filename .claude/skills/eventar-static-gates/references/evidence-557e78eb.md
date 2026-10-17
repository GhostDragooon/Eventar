Culprit: stale `tsconfig.tsbuildinfo` (08:54, from the errored `cols: string` run). Gitignored + regenerable → delete, run the canonical gate.

// The row type is spelled out rather than left to supabase-js's select
  // parser: incremental tsc (the tsc gate, next build) ran out of memory
  // printing the parser's type for this exported generic.