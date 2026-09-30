import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '*.config.*', '.env', '.env.*'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['apps/frontend/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['apps/backend/**/*.ts', 'packages/shared/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-console': ['warn', { allow: ['log', 'warn', 'error'] }],
    },
  },
];
