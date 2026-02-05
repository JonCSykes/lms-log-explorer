import js from "@eslint/js"
import ts from "@typescript-eslint/eslint-plugin"
import parser from "@typescript-eslint/parser"

export default [
  js.configs.recommended,
  {
    languageOptions: {
      parser: parser,
      ecmaVersion: 2024,
      sourceType: "module",
    },
    rules: {
      ...ts.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    },
  },
]
