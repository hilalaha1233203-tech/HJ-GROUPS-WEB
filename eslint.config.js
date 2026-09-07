import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.github/scripts/readerEnhancements.v4.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
      'no-empty': 'off',
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: ['api/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/Admin.jsx', 'src/AdminPanel.jsx'],
    rules: {
      'react-hooks/immutability': 'off',
      'no-unused-vars': 'off',
    },
  },
])
