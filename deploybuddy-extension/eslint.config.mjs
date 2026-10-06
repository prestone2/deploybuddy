import js from '@eslint/js'
import tseslint from 'typescript-eslint'
export default tseslint.config(
  { ignores: ['out/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['test/**/*.cjs'], languageOptions: { globals: { require: 'readonly', exports: 'readonly', console: 'readonly', setTimeout: 'readonly' } }, rules: { '@typescript-eslint/no-require-imports': 'off' } },
)
