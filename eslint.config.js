// @ts-check

// I hate eslint, this is stupid, why do I need 3 packages for this

const eslint = require("@eslint/js")
const globals = require("globals")
const tseslint = require("typescript-eslint")

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      "no-empty": "off",
      "prefer-const": "off",
      "no-async-promise-executor": "off",
      "@typescript-eslint/no-var-requires": "off",
    }
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  }
)