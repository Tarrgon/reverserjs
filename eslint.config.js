// I hate eslint, this is stupid, why do I need 3 packages for this

const eslint = require("@eslint/js")
const globals = require("globals")
const tseslint = require("typescript-eslint")
const stylistic = require("@stylistic/eslint-plugin")

module.exports = tseslint.config(
  {
    ignores: ["dist/**/*", "distclean/**/*", "**test**", "**/public/**/*", "node_modules/**/*"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended
    ]
  },
  {
    plugins: {
      "@stylistic": stylistic
    },
    ignores: ["dist/**/*", "distclean/**/*", "**test**", "**/public/**/*", "node_modules/**/*"],
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
      "quotes": ["error", "double", { "avoidEscape": true }],
      "semi": ["error", "never"],
      "@stylistic/indent": ["error", 2, { "SwitchCase": 1 }],
      "@stylistic/arrow-parens": ["error", "as-needed", { "requireForBlockBody": true }],
      "@stylistic/array-bracket-spacing": ["error", "never"],
      "@stylistic/block-spacing": ["error"],
      "@stylistic/brace-style": ["error", "1tbs", { "allowSingleLine": true }],
      "@stylistic/comma-dangle": ["error", {
        "arrays": "only-multiline",
        "objects": "only-multiline"
      }],
      "@stylistic/comma-spacing": ["error"],
      "@stylistic/dot-location": ["error", "property"],
      "@stylistic/function-call-spacing": ["error", "never"],
      "@stylistic/keyword-spacing": ["error"],
      "@stylistic/key-spacing": ["error"],
      "@stylistic/no-trailing-spaces": ["error"],
      "@stylistic/no-whitespace-before-property": ["error"],
      "@stylistic/object-curly-newline": ["error", {
        "multiline": true,
        "consistent": true
      }],
      "@stylistic/operator-linebreak": ["error", "before"]
    }
  },
  {
    ignores: ["dist/**/*", "distclean/**/*", "**test**", "**/public/**/*", "node_modules/**/*"],
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-namespace": "off",
    },
  }
)