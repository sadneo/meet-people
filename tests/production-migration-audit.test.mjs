import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compareInventory } from '../scripts/audit-production-migrations.mjs'

const files = [
  { name: '001_baseline.sql', sql: '' },
  { name: '002_push.sql', sql: 'create or replace function public.push_claim() returns int language sql as $$\nselect 1;\n$$;' },
]
test('reports pending and remote-only migration versions', () => {
  const result = compareInventory(files, [{ version: '001' }, { version: '000' }], [])
  assert.deepEqual(result.pending, ['002_push.sql'])
  assert.deepEqual(result.remoteOnly, ['000'])
  assert.equal(result.pushFunctionBodies[0].status, 'missing')
})
test('normalizes line endings but does not hide meaningful SQL differences', () => {
  assert.equal(compareInventory(files, [], [{ proname: 'push_claim', prosrc: '\r\nselect 1;\r\n' }]).pushFunctionBodies[0].status, 'matches')
  assert.equal(compareInventory(files, [], [{ proname: 'push_claim', prosrc: 'select 2;' }]).pushFunctionBodies[0].status, 'differs')
})
test('does not accept an overloaded name as a verified match', () => {
  const fn = { proname: 'push_claim', prosrc: 'select 1;' }
  assert.equal(compareInventory(files, [], [fn, fn]).pushFunctionBodies[0].status, 'ambiguous')
})
