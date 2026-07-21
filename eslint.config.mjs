import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Read-only design source snapshot (generated code, not app code)
    "design/**",
    // Agent-harness scratch space. `.claude/worktrees/*` are full git worktrees
    // — duplicate checkouts of this repo — so without this ESLint lints every
    // file twice and reports the design snapshot again under a path the
    // `design/**` pattern above cannot match.
    ".claude/**",
  ]),
  {
    rules: {
      // Allow variables/parameters prefixed with _ to be intentionally unused
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
