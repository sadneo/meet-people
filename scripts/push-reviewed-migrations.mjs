import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

export function reviewedMigrationFlags(ledger) {
  const rows = ledger.split('\n').flatMap(line => {
    const cells = line.split('|').map(cell => cell.replaceAll('`', '').trim())
    if (cells.length !== 3 || !cells.slice(0, 2).some(cell => /^\d{14}$/.test(cell))) return []
    if (cells.slice(0, 2).some(cell => cell !== '' && !/^\d{14}$/.test(cell))) throw new Error('Unrecognized migration ledger row')
    return [{ local: cells[0], remote: cells[1] }]
  })
  if (!rows.length) throw new Error('Migration ledger could not be verified')
  if (rows.some(row => row.remote && row.local !== row.remote)) throw new Error('Remote-only migration requires review')
  const head = rows.map(row => row.remote).filter(Boolean).sort().at(-1) ?? ''
  if (rows.some(row => row.local && !row.remote && row.local < head)) throw new Error('Unreviewed out-of-order migration; refusing deployment')
  return []
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv.slice(2)
  if (mode.length !== 1 || !['--dry-run', '--yes'].includes(mode[0])) throw new Error('Choose --dry-run or --yes')
  const ledger = execFileSync('pnpm', ['exec', 'supabase', 'migration', 'list', '--linked'], { encoding: 'utf8' })
  const flags = reviewedMigrationFlags(ledger)
  execFileSync('pnpm', ['exec', 'supabase', 'db', 'push', '--linked', ...flags, ...mode], { stdio: 'inherit' })
}
