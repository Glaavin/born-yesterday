import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Design-system Layer 1 guardrail: keep styling on the @theme token path.
  // See docs/design-system.md. These rules are deterministic and run in-editor
  // and in CI (required check on main), so drift is blocked before merge.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          // Tailwind arbitrary values in className: p-[13px], text-[#fff], bg-[rgb(...)]
          selector:
            "JSXAttribute[name.name='className'] Literal[value=/-\\[[^\\]]+\\]/]",
          message:
            "Design-system guardrail: no Tailwind arbitrary values (e.g. p-[13px], text-[#fff]). Use an @theme token or the standard scale. See docs/design-system.md.",
        },
        {
          // Same, inside template-literal classNames: `p-[${x}]`
          selector:
            "JSXAttribute[name.name='className'] TemplateElement[value.raw=/-\\[[^\\]]+\\]/]",
          message:
            "Design-system guardrail: no Tailwind arbitrary values in template classNames. Use an @theme token or the standard scale. See docs/design-system.md.",
        },
        {
          // Hardcoded hex colors in inline style props: style={{ color: '#10b981' }}
          selector:
            "JSXAttribute[name.name='style'] Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]",
          message:
            "Design-system guardrail: no hardcoded hex colors in inline styles. Define an @theme token in globals.css and reference it. See docs/design-system.md.",
        },
      ],
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
