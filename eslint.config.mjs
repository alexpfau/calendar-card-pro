import { FlatCompat } from '@eslint/eslintrc';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierPlugin from 'eslint-plugin-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierConfig from 'eslint-config-prettier';

const compat = new FlatCompat();

export default [
  {
    // Tests are linted with the same rules as src. They are devDependency-only and
    // never enter the bundle (rollup follows the import graph from src/calendar-card-pro.ts),
    // but they import from src, so they benefit from the same type-aware checks.
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
      import: importPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['sibling', 'parent'], 'index', 'unknown'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'prettier/prettier': ['error'],
      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
          allowSeparatedGroups: true,
        },
      ],
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          alwaysTryTypes: true,
        },
      },
    },
  },
  {
    // The rendering layer must not turn config values into JS numbers.
    //
    // `day_spacing` and `day_font_size` are documented as CSS length *strings*. They were
    // honoured raw where passed straight to a custom property, but every *derived* length
    // went through `parseFloat(...) + 'px'`, which silently discards the author's unit:
    // `day_spacing: 2em` drew its separators at 2px, and `calc()` parsed to `NaN` and
    // emitted the literal string `NaNpx`. Both defect sites lived in this directory
    // (`render.ts` twice, `styles.ts` once) and both shipped in v3.6.0, surviving twelve
    // review passes — every default is a px value, so the bug and the tests agreed.
    //
    // Nothing mechanical prevented a new derived-length site from reintroducing it, hence
    // this rule. Scale lengths with `ViewConfig.scaleLength`, which keeps the unit and
    // defers `calc()`/`var()` to the browser; coerce editor form input with
    // `Config.toValidNumber`. Genuine counts belong in the config or utils layer, which is
    // why this is scoped to `src/rendering/` and not to `src/`.
    files: ['src/rendering/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name=/^parse(Float|Int)$/]',
          message:
            'Do not parse config values into numbers in the rendering layer — it discards CSS units (v3.6.0 drew `2em` separators at 2px, and `calc()` became `NaNpx`). Scale lengths with ViewConfig.scaleLength(); coerce editor input with Config.toValidNumber().',
        },
        {
          selector:
            "CallExpression[callee.object.name='Number'][callee.property.name=/^parse(Float|Int)$/]",
          message:
            'Do not parse config values into numbers in the rendering layer — it discards CSS units (v3.6.0 drew `2em` separators at 2px, and `calc()` became `NaNpx`). Scale lengths with ViewConfig.scaleLength(); coerce editor input with Config.toValidNumber().',
        },
      ],
    },
  },
  {
    // The build/CI tooling. These are plain Node ESM, not TypeScript, so they get the
    // default parser and none of the type-aware rules — but they do gate every PR, and
    // a bug here is invisible to `tsc` and to the test suite. Y22 shipped from this
    // layer. Formatting is enforced for the same reason it is in src: three of these
    // files had drifted out of prettier style while nothing was watching.
    //
    // Only core rules that need no `globals` declaration are enabled, so `no-undef` is
    // deliberately absent — these files legitimately use Node globals, and declaring
    // them would mean depending on a package that is not a direct devDependency.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      prettier: prettierPlugin,
      import: importPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': ['error'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-constant-condition': 'error',
      'no-self-compare': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['sibling', 'parent'], 'index', 'unknown'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];
