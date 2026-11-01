import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { portsFor, projectFor, repository, validateManifest, privateJson, readJson, validateUiUsers, publicRun } from './state.mjs';
import { createPlan, validatePlan, plannedIdentity, pairActors, pairOrdinals, actorDirectory, userDirectory, initialBatch, nextPair, requiredBatchStages } from './batch-state.mjs';
import { reservePair, validatePairLimit } from './batch.mjs';
import { stopServices } from './processes.mjs';
import { supabaseConfig, validateMapsBudget, serviceEnvironment, redact } from './config.mjs';
import { smoke } from './journeys.mjs';

await mkdir('/tmp/opencode', { recursive: true });
const root = await mkdtemp('/tmp/opencode/qa-batch-test-');
after(() => rm(root, { recursive: true, force: true }));
const id = '20261101-120000-1234abcd';
const run = { version: 1, id, projectId: projectFor(id), repository, directory: join(root, id), workdir: join(root, id, 'stack'),
  count: 100, uiUsers: 100, slot: 0, ports: portsFor(), services: [], imagesBefore: [], imageRefs: [] };

test('optional manifest UI count defaults to two; validates even count and bounds', () => {
  assert.equal(validateUiUsers(100), 2);
  for (const uiUsers of [2, 4, 98, 100]) assert.equal(validateManifest({ ...run, uiUsers }, run.directory, root).uiUsers, uiUsers);
  const legacy = { ...run }; delete legacy.uiUsers;
  assert.doesNotThrow(() => validateManifest(legacy, run.directory, root));
  assert.equal(publicRun(legacy).backgroundUsers, 98);
  assert.equal(publicRun(run).backgroundUsers, 0);
  for (const uiUsers of [0, 1, 3, 99, 102, 2.5, '100', null, NaN, Infinity]) {
    assert.throws(() => validateManifest({ ...run, uiUsers }, run.directory, root), /UI users/);
  }
});

test('100 private personas are unique plans, not provisioned accounts', () => {
  const plan = createPlan(run);
  assert.equal(validatePlan(run, plan), plan);
  for (const field of ['email', 'username', 'name', 'password']) assert.equal(new Set(plan.users.map(user => user[field])).size, 100);
  assert.equal(new Set(plan.users.map(user => user.birthdate)).size, 16);
  assert.deepEqual(plan.users[99].interests, ['Coffee', 'Art', 'Music']);
  for (const field of ['ordinal', 'role', 'email', 'username', 'birthdate', 'password', 'directory']) {
    const changed = structuredClone(plan); changed.users[0][field] = '../escape';
    assert.throws(() => validatePlan(run, changed));
  }
  assert.throws(() => validatePlan(run, { ...plan, users: plan.users.slice(1) }));
});

test('batch service environment raises only its finite isolated QA email budget', () => {
  const runtime = { supabaseUrl: 'http://127.0.0.1:55421', publicKey: 'qa-public', serviceKey: 'qa-private', signingKey: 'qa-signing' };
  const batch = serviceEnvironment(run, runtime);
  assert.equal(batch.QA_RUN_ID, run.id);
  assert.equal(batch.QA_AUTH_EMAIL_REQUESTS_PER_WINDOW, '300');
  const ordinary = serviceEnvironment({ ...run, uiUsers: 2 }, runtime);
  assert.equal(ordinary.QA_RUN_ID, undefined);
  assert.equal(ordinary.QA_AUTH_EMAIL_REQUESTS_PER_WINDOW, undefined);
});

test('pair bounds and ordinal-derived evidence directories cannot escape or reset budgets', async () => {
  assert.deepEqual(pairOrdinals(run, 1), [1, 2]);
  assert.deepEqual(pairOrdinals(run, 50), [99, 100]);
  for (const invalid of [0, 51, 1.5, '1', NaN, '../escape']) {
    assert.throws(() => pairOrdinals(run, invalid));
  }
  for (const invalid of [0, 101, 1.5, '1', NaN, '../escape']) {
    assert.throws(() => userDirectory(run, invalid));
  }
  const plan = createPlan(run);
  await privateJson(join(run.directory, 'batch-plan.json'), plan);
  assert.equal(await actorDirectory(run, 'a', plan.users[98]), join(run.directory, 'agents', 'user-099'));
  await assert.rejects(actorDirectory(run, 'b', plan.users[98]), /fixed private batch plan/);
  await assert.rejects(actorDirectory(run, 'a', { ...plan.users[0], directory: root }), /fixed private batch plan/);
  assert.equal(await actorDirectory({ ...run, uiUsers: 2 }, 'a', {}), join(run.directory, 'agents', 'a'));
  assert.deepEqual(Object.values(await pairActors(run, 50)).map(actor => actor.ordinal), [99, 100]);
});

test('resume requires explicit contiguous completed pairs and refuses partial/failed/ambiguous actors', () => {
  const state = initialBatch(run);
  assert.equal(nextPair(run, state), 1);
  state.pairs[0].status = 'passed';
  state.pairs[0].users.forEach(user => { user.status = 'passed'; user.stages = [...requiredBatchStages]; });
  assert.throws(() => nextPair(run, state), /--resume/);
  assert.equal(nextPair(run, state, true), 2);
  for (const status of ['running', 'failed', 'unknown']) {
    const changed = structuredClone(state); changed.pairs[1].status = status;
    assert.throws(() => nextPair(run, changed, true), /must not be re-registered/);
  }
  const partial = structuredClone(state); partial.pairs[1].users[0].status = 'passed';
  assert.throws(() => nextPair(run, partial, true), /partial user progress/);
  const noncontiguous = structuredClone(state); noncontiguous.pairs[2].status = 'passed';
  assert.throws(() => nextPair(run, noncontiguous, true), /Noncontiguous/);
  const missingStage = structuredClone(state); missingStage.pairs[0].users[0].stages.pop();
  assert.throws(() => nextPair(run, missingStage, true), /incomplete completed pairs/);
  for (const pair of state.pairs) { pair.status = 'passed'; pair.users.forEach(user => { user.status = 'passed'; user.stages = [...requiredBatchStages]; }); }
  assert.equal(nextPair(run, state, true), null);
});

test('pair reservations are exclusive, preserve prior results and reject existing actor evidence', async () => {
  await privateJson(join(run.directory, 'batch-plan.json'), createPlan(run));
  const reserved = await reservePair(run, 1);
  await privateJson(reserved.outputPath, { sentinel: 'original' });
  await assert.rejects(reservePair(run, 1), { code: 'EEXIST' });
  assert.deepEqual(await readJson(reserved.outputPath), { sentinel: 'original' });
  await mkdir(userDirectory(run, 3), { recursive: true, mode: 0o700 });
  await assert.rejects(reservePair(run, 2), /refusing replay or overwrite/);
  for (const pairs of [0, 51, -1, 1.1, '2', NaN]) assert.throws(() => validatePairLimit(pairs));
  assert.equal(validatePairLimit(50), 50);
});

test('role-scoped teardown preserves API/web ownership records', async () => {
  const local = { ...run, directory: join(root, 'stop-services'), services: [
    { role: 'api', pid: 2147483645, start: '1' }, { role: 'web', pid: 2147483644, start: '2' },
    { role: 'a', pid: 2147483643, start: '3' }, { role: 'b', pid: 2147483642, start: '4' },
  ] };
  await stopServices(local, ['a', 'b']);
  assert.deepEqual(local.services.map(service => service.role), ['api', 'web']);
  await assert.rejects(stopServices(local, ['other']), /Invalid service roles/);
});

test('Maps opt-in is bounded, defaults to 100, and does not leak ambient provider configuration', () => {
  for (const budget of [0, 1001, 1.1, '300', null, NaN]) assert.throws(() => validateMapsBudget(true, budget));
  assert.throws(() => validateMapsBudget(false, 300));
  assert.equal(validateMapsBudget(true, 300), 300);
  const runtime = { mapsServerKey: 'private-test', mapsBrowserKey: 'public-test' };
  assert.equal(serviceEnvironment(run, runtime).GOOGLE_MAPS_REQUESTS_PER_DAY, '100');
  assert.equal(serviceEnvironment(run, { ...runtime, mapsRequestLimit: 300 }).GOOGLE_MAPS_REQUESTS_PER_DAY, '300');
  assert.equal(serviceEnvironment(run, {}).QA_MAPS_ENABLED, undefined);
});

test('finite QA auth rates apply only to batch config; confirmations stay mandatory', () => {
  assert.match(supabaseConfig(run), /email_sent = 300/);
  assert.match(supabaseConfig(run), /sign_in_sign_ups = 300/);
  assert.match(supabaseConfig(run), /token_verifications = 150/);
  assert.match(supabaseConfig(run), /enable_confirmations = true/);
  assert.doesNotMatch(supabaseConfig({ ...run, uiUsers: 2 }), /\[auth.rate_limit\]/);
});

test('UI-only fixture adapter refuses before any account, SQL or network operation', async () => {
  const { seedFixtures } = await import('./fixtures.mjs');
  await assert.rejects(seedFixtures(run, {}), /must never call the background fixture adapter/);
});

test('log redaction covers all planned passwords, including users outside the current pair', async () => {
  const local = { ...run, directory: join(root, 'redaction') }, plan = createPlan(run);
  await privateJson(join(local.directory, 'batch-plan.json'), plan);
  const text = await redact(`${plan.users[0].password} ${plan.users[99].password}`, local);
  assert.equal(text, '[REDACTED] [REDACTED]');
});

test('scripted batch journey proves profile persistence and logout through controller actions only', async () => {
  const local = { ...run, directory: join(root, 'mock-journey') };
  const actors = { a: { ...plannedIdentity(run, 1), password: 'unused' }, b: { ...plannedIdentity(run, 2), password: 'unused' } };
  await privateJson(join(local.directory, 'actors.json'), actors);
  for (const [role, port] of [['a', run.ports.agentA], ['b', run.ports.agentB]]) await privateJson(join(local.directory, 'control', `${role}.json`), { port, token: 'a'.repeat(64) });
  const original = globalThis.fetch, calls = [], progress = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...JSON.parse(init.body) });
    return { ok: true, json: async () => ({ screenshot: 'mock-only.png' }) };
  };
  try {
    const result = await smoke(local, { outputPath: join(local.directory, 'pair-results.json'), profilePersistence: true, logout: true, stopOnFailure: true,
      onProgress: async value => { progress.push(structuredClone(value)); } });
    assert.equal(result.ok, true);
    assert.equal(result.results.length, 2);
    for (const user of result.results) {
      assert.ok(user.stages.includes('profile-edit-save-reload'));
      assert.equal(user.stages.at(-1), 'logout');
    }
    assert.equal(calls.filter(call => call.method === 'email').length, 2);
    assert.equal(calls.filter(call => call.method === 'assert-value').length, 2);
    assert.ok(calls.every(call => /^http:\/\/127\.0\.0\.1:330[23]\/action$/.test(call.url)));
    assert.equal(progress.filter(user => user.status === 'passed').length, 2);
  } finally { globalThis.fetch = original; }
});

test('scripted failure stops before second registration and retains the failed stage', async () => {
  const local = { ...run, directory: join(root, 'mock-failure') };
  await privateJson(join(local.directory, 'actors.json'), { a: plannedIdentity(run, 1), b: plannedIdentity(run, 2) });
  await privateJson(join(local.directory, 'control', 'a.json'), { port: run.ports.agentA, token: 'a'.repeat(64) });
  const original = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, init) => {
    const input = JSON.parse(init.body); calls.push({ url, ...input });
    return { ok: input.method !== 'credential', json: async () => ({ error: 'mock UI failure', screenshot: 'mock-only.png' }) };
  };
  try {
    const outputPath = join(local.directory, 'failure.json');
    const result = await smoke(local, { outputPath, profilePersistence: true, logout: true, stopOnFailure: true });
    assert.equal(result.ok, false);
    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].failedStage, 'registration');
    assert.equal((await readJson(outputPath))[0].status, 'failed');
    assert.ok(calls.every(call => call.url.includes(':3302/')));
    assert.ok(calls.some(call => call.path === '/logout'));
  } finally { globalThis.fetch = original; }
});
