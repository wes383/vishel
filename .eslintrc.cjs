module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  // orkest-ui is a vendored design-reference app, not app source.
  ignorePatterns: ['dist', '.eslintrc.cjs', 'orkest-ui'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    // Restored from the disabled state recorded in docs/project-analysis.md. Anything still
    // switched off here has a comment saying why.
    'react-hooks/exhaustive-deps': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    'prefer-const': 'error',
    'no-useless-escape': 'error',
    'no-case-declarations': 'error',
    'no-control-regex': 'error',
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/ban-ts-comment': 'off',
    // Component files export their props/context helpers alongside components; enabling this
    // would require splitting every context module.
    'react-refresh/only-export-components': 'off',
  },
}
