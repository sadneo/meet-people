import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import process from 'node:process'

test('local Supabase authentication and account persistence', () => {
  execFileSync(process.execPath, ['tests/integration/local/test-local-auth.mjs'], { stdio: 'inherit' })
})

test('disposable PostgreSQL product schema replay', () => {
  execFileSync(process.execPath, ['tests/integration/local/test-product-schema.mjs'], { stdio: 'inherit' })
})
