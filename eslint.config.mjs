import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Allow the standard `const { x, ...rest } = obj` idiom used in tests
    // to assert behavior against an object minus a key. The destructured
    // name is intentionally discarded; `rest` is the asserted value.
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", {
        ignoreRestSiblings: true,
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
    },
  },
  {
    // `const { data } = await supabase...` passes tsc, passes every test, and
    // silently turns an infrastructure failure into "nothing here" — the exact
    // defect the 2026-08-05 review found six times in one pass (rule 12,
    // "fail visibly, not silently"). PostgrestResponse legitimately permits
    // ignoring `error`, so the type system cannot catch it; only the shape can.
    rules: {
      "no-restricted-syntax": ["error", {
        selector:
          "VariableDeclarator:has(AwaitExpression) > ObjectPattern:has(Property[key.name='data']):not(:has(Property[key.name='error']))",
        message:
          "Destructuring `data` without `error` collapses 'the query failed' into 'there is nothing here'. Destructure `error` and handle it (throw, or render the failure) — or disable this line with a comment saying why an absent row is genuinely indistinguishable from a failure here.",
      }],
    },
  },
  {
    // Tests intentionally bypass the type system to exercise runtime guards
    // (Zod rejection of ill-typed inputs, hand-rolled Supabase client mocks).
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // The rule above is production-only. It fires on 80 read-backs in tests/,
    // and NONE of them are the defect it exists to catch: on failure
    // supabase-js returns `data: null` (never `[]`), and every assertion the
    // suite makes on a read-back rejects null — `toHaveLength(0)`,
    // `toEqual([])` and `toBeNull()` on `row?.field` (undefined) all throw.
    // Measured, not assumed. So all 80 would be ceremony, which is how a rule
    // gets trained into reflex-disabling. The shape that WOULD defeat this,
    // `expect(data ?? []).toHaveLength(0)`, appears nowhere in the suite;
    // that residual is tracked in docs/DEFERRED.md under
    // "The swallowed-error lint rule is production-only".
    files: ["tests/**", "scripts/**"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Spawned-session worktrees carry a full repo copy (incl. their own
    // .next build output) — never lint them from the main tree.
    ".claude/**",
    // Gitignored throwaway backtest/demo scripts — not shipped code.
    "scratch-demo/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
