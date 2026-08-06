const prettierConfig = require('eslint-config-prettier')

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**', 'prisma/migrations/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      sourceType: 'module',
    },
  },
  prettierConfig,
]
