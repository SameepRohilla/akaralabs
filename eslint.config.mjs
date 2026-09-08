// Flat config — eslint-config-next 16 exports flat config arrays directly,
// so no FlatCompat wrapper is needed (and it doesn't work with one).
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "drizzle/**",
      // The legacy design-system JS, kept byte-identical from the static site.
      "public/assets/**",
      // Build-time codegen, run by hand rather than shipped.
      "scripts/**",
      // Bundled operational scripts — generated output, not source.
      "ops/**",
    ],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // The legacy design system is served from /public as a plain stylesheet so
    // the original CSS stays byte-identical — importing it would let the
    // bundler rewrite it. This is the one place that's intended.
    files: ["src/app/layout.tsx"],
    rules: { "@next/next/no-css-tags": "off" },
  },
];

export default config;
