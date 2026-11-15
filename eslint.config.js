import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/', 'supabase/.temp/', '.claude/', 'qa/', 'src/alt/', '.android-build/', '.gcloud-local/', 'Pebble-APKs/', 'android/**/build/', 'android/app/src/main/assets/public/'] },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'tools/qa-real-users/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/ui/garden*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      globals: globals.deno,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs['recommended-latest'].rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
)
