import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'scripts/**/*.mjs', '*.ts', '*.mjs'],
    languageOptions: { globals: globals.node }
  },
  {
    // The addon's loader is CommonJS, because a .node binary is loaded with require.
    files: ['native/**/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat['recommended-latest']],
    languageOptions: { globals: globals.browser }
  },
  {
    // The renderer never touches Node, and never reaches into the main process (PLAN.md 6).
    // Type-only imports of the IPC view are the exception: they describe the shape of what crosses
    // the contextBridge and erase entirely at build time, so no main-process code follows them.
    files: ['src/renderer/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'node:*'], message: 'The renderer never touches Node or Electron.' },
            {
              group: ['**/main/**'],
              allowTypeImports: true,
              message: 'Only types may cross from main; everything else goes through the preload.'
            }
          ]
        }
      ]
    }
  }
)
