import { mkdirSync, writeFileSync } from 'node:fs'
import { supabase } from './supabase.mjs'

const { child, code } = await supabase(['gen', 'types', 'typescript', '--local'], ['ignore', 'pipe', 'inherit'])
const chunks = []
child.stdout.on('data', chunk => chunks.push(chunk))
const status = await code
if (status === 0) {
  mkdirSync('src/types', { recursive: true })
  writeFileSync('src/types/database.ts', Buffer.concat(chunks))
}
process.exitCode = status
