import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { evidenceHistory } from './evidence.mjs';
import { privateJson } from './state.mjs';

test('browser resume retains evidence, screenshot numbering and action budget', async () => {
  await mkdir('/tmp/opencode', { recursive: true });
  const directory = await mkdtemp('/tmp/opencode/qa-evidence-test-');
  try {
    assert.deepEqual(await evidenceHistory(directory), { actions: [], problems: [], findings: [], coverage: [], sequence: 0 });
    await privateJson(join(directory, 'actions.json'), Array.from({ length: 300 }, () => ({ method: 'look' })));
    await privateJson(join(directory, 'findings.json'), [{ id: 'existing' }]);
    await privateJson(join(directory, 'coverage.json'), [{ status: 'passed' }]);
    await writeFile(join(directory, 'checkpoint-0043.png'), 'existing evidence', { mode: 0o600 });
    await writeFile(join(directory, 'checkpoint-0009.png'), 'older evidence', { mode: 0o600 });
    const history = await evidenceHistory(directory);
    assert.equal(history.actions.length, 300);
    assert.equal(history.sequence, 43);
    assert.deepEqual(history.findings, [{ id: 'existing' }]);
    assert.deepEqual(history.coverage, [{ status: 'passed' }]);
    await privateJson(join(directory, 'actions.json'), {});
    await assert.rejects(evidenceHistory(directory), /Invalid QA evidence history/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
