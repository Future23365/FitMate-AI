import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: ["codex_logs/**"],
  },
  ...nextVitals,
];

export default eslintConfig;
