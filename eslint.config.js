// eslint.config.mjs
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals'; // 이걸 불러와야 해

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'build/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      'no-undef': 'off',
    },
  },
];
