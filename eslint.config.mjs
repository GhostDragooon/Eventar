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
    // Tests intentionally bypass the type system to exercise runtime guards
    // (Zod rejection of ill-typed inputs, hand-rolled Supabase client mocks).
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
