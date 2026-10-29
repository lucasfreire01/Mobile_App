import { configApp } from '@adonisjs/eslint-config'

export default [
  ...configApp(),
  { ignores: ['database/schema.ts', 'mobile_vpn/**'] },
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
]
