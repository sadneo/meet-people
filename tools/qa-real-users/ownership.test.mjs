import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { assertContainerOwner, assertNetworkOwner, canRemoveImage } from './docker.mjs';
import { serviceEnvironment, supabaseConfig } from './config.mjs';
import { ownsService } from './processes.mjs';
import { portsFor, tooling } from './state.mjs';

const run = { id: '20261031-120000-0123abcd', projectId: 'pebble-qa-20261031-120000-0123abcd',
  directory: '/run-owned-test', workdir: '/run-owned-test/stack', ports: portsFor(), imagesBefore: ['old-image'] };
const labels = { 'com.supabase.cli.project': run.projectId, 'com.supabase.cli.workdir': run.workdir };

test('cleanup refuses dev, relabeled and wrong-workdir containers', () => {
  assert.doesNotThrow(() => assertContainerOwner(run, { Config: { Labels: labels } }));
  for (const other of [{}, { ...labels, 'com.supabase.cli.project': 'meet-people' },
    { ...labels, 'com.supabase.cli.workdir': '/normal-dev-worktree' }]) {
    assert.throws(() => assertContainerOwner(run, { Config: { Labels: other } }), /ownership/);
  }
});

test('network verification uses full IDs and refuses a foreign member', () => {
  const id = 'a'.repeat(64), container = { Id: id };
  assert.doesNotThrow(() => assertNetworkOwner(run, { Labels: labels, Containers: { [id]: {} } }, [container]));
  assert.throws(() => assertNetworkOwner(run, { Labels: labels, Containers: { [id]: {}, unrelated: {} } }, [container]), /unrelated/);
  assert.throws(() => assertNetworkOwner(run, { Labels: { ...labels, 'com.supabase.cli.workdir': '/other' }, Containers: {} }, []), /ownership/);
  assert.throws(() => assertNetworkOwner(run, { Labels: labels, Containers: { [id]: {} } }, [{ Id: id.slice(0, 12) }]), /unrelated/);
});

test('only new and unused image IDs are eligible for removal', () => {
  assert.equal(canRemoveImage(run, 'old-image', new Set()), false);
  assert.equal(canRemoveImage(run, 'new-image', new Set(['new-image'])), false);
  assert.equal(canRemoveImage(run, 'new-image', new Set()), true);
});

test('process cleanup requires the exact owned service entrypoint, role and run', () => {
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const info = { pid: 123, group: 123, command: [process.execPath, '--import', loader, join(tooling, 'service.mjs'), 'api', run.id] };
  assert.equal(ownsService(info, run, 'api'), true);
  assert.equal(ownsService({ ...info, group: 999 }, run, 'api'), false);
  assert.equal(ownsService(info, run, 'web'), false);
  assert.equal(ownsService({ ...info, command: ['node', '/other/service.mjs', 'api', run.id] }, run, 'api'), false);
  assert.equal(ownsService({ ...info, command: ['node', join(tooling, 'service.mjs'), 'api', 'different-run'] }, run, 'api'), false);
});

test('service environment never inherits provider/database keys or root dotenv paths', () => {
  const old = process.env.GOOGLE_MAPS_SERVER_API_KEY;
  process.env.GOOGLE_MAPS_SERVER_API_KEY = 'must-not-inherit';
  try {
    const env = serviceEnvironment(run, { supabaseUrl: 'http://127.0.0.1:55421', publicKey: 'qa-public', serviceKey: 'qa-private', signingKey: 'qa-signing' });
    assert.equal(env.GOOGLE_MAPS_SERVER_API_KEY, undefined);
    assert.equal(env.PORT, '3301');
    assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55421');
    assert.equal(env.GOOGLE_MAPS_STORAGE_APPROVED, 'false');
    for (const key of ['TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) assert.ok(env[key].startsWith(run.directory + '/'));
  } finally { if (old === undefined) delete process.env.GOOGLE_MAPS_SERVER_API_KEY; else process.env.GOOGLE_MAPS_SERVER_API_KEY = old; }
});

test('disposable config requires real confirmation, isolated ports and no legacy seed', () => {
  const config = supabaseConfig(run);
  assert.ok(config.includes(`project_id = "${run.projectId}"`));
  assert.ok(config.includes('enable_confirmations = true'));
  assert.ok(config.includes('[db.seed]\nenabled = false'));
  assert.ok(config.includes('site_url = "http://127.0.0.1:3300"'));
  assert.ok(!config.includes('54321') && !config.includes('3000'));
  assert.ok(!config.includes('env('));
});

test('explicit Maps runtime enables only Maps settings without changing QA database', () => {
  const env = serviceEnvironment(run, { supabaseUrl: 'http://127.0.0.1:55421', publicKey: 'qa-public', serviceKey: 'qa-private',
    signingKey: 'qa-signing', mapsBrowserKey: 'test-browser', mapsServerKey: 'test-server' });
  assert.equal(env.GOOGLE_MAPS_SERVER_API_KEY, 'test-server');
  assert.equal(env.VITE_GOOGLE_MAPS_API_KEY, 'test-browser');
  assert.equal(env.GOOGLE_MAPS_STORAGE_APPROVED, 'true');
  assert.equal(env.GOOGLE_MAPS_REQUESTS_PER_DAY, '100');
  assert.equal(env.QA_MAPS_ENABLED, 'true');
  assert.equal(env.SUPABASE_URL, 'http://127.0.0.1:55421');
});
