module.exports = {
  root: true,
  env: {
    es2024: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "./tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "import"],
  extends: ["airbnb-base", "airbnb-typescript/base", "prettier"],
  settings: {
    "import/resolver": {
      typescript: {
        project: "./tsconfig.json",
      },
    },
  },
  rules: {
    "class-methods-use-this": "off",
    "import/extensions": [
      "error",
      "ignorePackages",
      {
        js: "never",
        jsx: "never",
        ts: "never",
        tsx: "never",
      },
    ],
    "import/no-extraneous-dependencies": [
      "error",
      {
        devDependencies: ["src/__tests__/**/*.ts", "src/**/*.test.ts"],
      },
    ],
    "import/prefer-default-export": "off",
    "no-await-in-loop": "off",
    "no-console": "off",
    "no-continue": "off",
    "no-promise-executor-return": "off",
    "no-plusplus": "off",
    "no-restricted-syntax": "off",
    "no-void": "off",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
      },
    ],
    "@typescript-eslint/lines-between-class-members": "off",
    "@typescript-eslint/no-throw-literal": "off",
    "@typescript-eslint/no-use-before-define": [
      "error",
      {
        functions: false,
      },
    ],
  },
  overrides: [
    {
      files: ["src/__tests__/**/*.ts"],
      rules: {
        "max-classes-per-file": "off",
        "no-nested-ternary": "off",
        "no-restricted-syntax": "off",
      },
    },
  ],
};
