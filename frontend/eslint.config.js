import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist"] },
  js.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Components are used in JSX, which this rule does not count as a use.
      "no-unused-vars": ["error", { varsIgnorePattern: "^[A-Z]", argsIgnorePattern: "^_" }],
      eqeqeq: "error",
      "prefer-const": "error",
    },
  },
];
