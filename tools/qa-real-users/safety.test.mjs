import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  loadRun, portsFor, privateJson, projectFor, readJson, repository,
  runPattern, validateManifest, processInfo,
} from './state.mjs';

// No lifecycle or Docker imports: these tests must never manage real resources.
const fixture = await mkdtemp('/tmp/opencode/qa-safety-');
after(async () => { await rm(fixture, { recursive: true, force: true }); });
const id = '20261031-120000-0123abcd';
const root = join(fixture, 'runs');
const directory = join(root, id);
const manifest = (overrides = {}, base = root) => ({
  version: 1, id, projectId: projectFor(id), directory: join(base, id),
  repository, workdir: join(base, id, 'stack'), count: 4, slot: 0,
  ports: portsFor(0), services: [], imagesBefore: [], imageRefs: [], ...overrides,
});

test('run IDs reject paths, traversal, malformed IDs, and shell-like input', async () => {
  assert.ok(runPattern.test(id));
  assert.equal(projectFor(id), `pebble-qa-${id}`);
  for (const invalid of ['', '.', '..', `../${id}`, `${id}/..`, `/${id}`,
    `${id}/manifest.json`, `${id}\\..`, `${id}\n`, '20261031-120000-0123ABCD',
    '20261031-120000-0123abc', `${id};echo unsafe`]) {
    assert.throws(() => projectFor(invalid), /Invalid run ID/);
    await assert.rejects(loadRun(invalid, root), /Invalid run ID/);
  }
});

test('all ten slots have exact, nonoverlapping port mappings', () => {
  const seen = new Set();
  for (let slot = 0; slot <= 9; slot++) {
    const offset = slot * 20;
    const expected = {
      web: 3300 + offset, api: 3301 + offset, agentA: 3302 + offset,
      agentB: 3303 + offset, shadow: 55420 + offset, supabase: 55421 + offset,
      db: 55422 + offset, studio: 55423 + offset, mail: 55424 + offset,
      pooler: 55429 + offset,
    };
    assert.deepEqual(portsFor(slot), expected);
    for (const port of Object.values(expected)) {
      assert.equal(seen.has(port), false);
      seen.add(port);
    }
  }
  assert.deepEqual(portsFor(), portsFor(0));
  for (const slot of [-1, 10, 0.5, NaN, Infinity, '0', null, true]) {
    assert.throws(() => portsFor(slot), /Slot must be/);
  }
});

test('manifest validates the baseline and rejects tampered resource boundaries', () => {
  const valid = manifest();
  assert.equal(validateManifest(valid, directory, root), valid);
  for (const count of [4, 100]) {
    assert.doesNotThrow(() => validateManifest(manifest({ count }), directory, root));
  }
  const mutations = [
    { version: 2 }, { id: '../escape' }, { projectId: 'production' },
    { directory: join(fixture, 'elsewhere') }, { repository: fixture },
    { workdir: repository }, { slot: -1 }, { slot: 10 }, { slot: '0' },
    ...[3, 101, 4.5, '4', null, NaN].map(count => ({ count })),
    { ports: { ...portsFor(), db: 54322 } }, { ports: {} },
    { ports: { ...portsFor(), extra: 12345 } },
    { services: {} }, { imagesBefore: null }, { imageRefs: 'image' },
  ];
  for (const change of mutations) {
    assert.throws(() => validateManifest(manifest(change), directory, root), undefined,
      `accepted mutation ${JSON.stringify(change)}`);
  }
  assert.throws(() => validateManifest(valid, join(fixture, 'elsewhere'), root));
  assert.throws(() => validateManifest(valid, directory, join(fixture, 'other-root')));
});

test('unsafe process ownership records are refused', () => {
  const service = { role: 'api', pid: 12345, start: '123456789' };
  for (const role of ['api', 'web', 'a', 'b']) {
    assert.doesNotThrow(() => validateManifest(manifest({ services: [{ ...service, role }] }), directory, root));
  }
  const unsafe = [
    { role: 'docker' }, { role: '' },
    ...[-1, 0, 1, 1.5, '12345', null, NaN, Infinity].map(pid => ({ pid })),
    ...['', '-1', '1.5', '123x', '12\n34', undefined, 1234].map(start => ({ start })),
  ];
  for (const change of unsafe) {
    assert.throws(() => validateManifest(manifest({ services: [{ ...service, ...change }] }), directory, root),
      /Invalid process ownership record/);
  }
});

test('private JSON is owner-only, replaces permissive files, and leaves no pending files', async () => {
  const parent = join(fixture, 'private');
  const path = join(parent, 'state.json');
  await privateJson(path, { secret: 'fixture-only' });
  assert.equal((await lstat(parent)).mode & 0o777, 0o700);
  assert.equal((await lstat(path)).mode & 0o777, 0o600);
  assert.deepEqual(await readJson(path), { secret: 'fixture-only' });
  const permissive = join(parent, 'permissive.json');
  await writeFile(permissive, '{}', { mode: 0o644 });
  await privateJson(permissive, { replaced: true });
  assert.equal((await lstat(permissive)).mode & 0o777, 0o600);
  assert.deepEqual(await readJson(permissive), { replaced: true });
  assert.deepEqual((await readdir(parent)).sort(), ['permissive.json', 'state.json']);
});

test('readJson refuses symlinks and oversized state files', async () => {
  const target = join(fixture, 'target.json');
  const link = join(fixture, 'linked.json');
  await privateJson(target, { safe: true });
  await symlink(target, link);
  await assert.rejects(readJson(link), { code: 'ELOOP' });
  const oversized = join(fixture, 'oversized.json');
  await writeFile(oversized, ' '.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(readJson(oversized), /Untrusted QA state file/);
});

test('private state refuses permissive files and process identities have no trailing empty argv', async () => {
  const path = join(fixture, 'too-public.json');
  await privateJson(path, { secret: 'synthetic' });
  await chmod(path, 0o644);
  await assert.rejects(readJson(path), /Untrusted QA state file/);
  const self = await processInfo(process.pid);
  assert.equal(self.pid, process.pid);
  assert.equal(typeof self.start, 'string');
  assert.ok(self.command.length > 0);
  assert.ok(self.command.every(Boolean));
});

test('loadRun accepts a private fixture and refuses manifest and directory symlinks', async () => {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await privateJson(join(directory, 'manifest.json'), manifest());
  assert.deepEqual(await loadRun(id, root), manifest());

  const linkedRoot = join(fixture, 'linked-root');
  await symlink(root, linkedRoot);
  await assert.rejects(loadRun(id, linkedRoot), /Untrusted QA directory/);

  const otherRoot = join(fixture, 'directory-link-root');
  await mkdir(otherRoot);
  await symlink(directory, join(otherRoot, id));
  await assert.rejects(loadRun(id, otherRoot), /Untrusted QA directory/);

  const ancestorLink = join(fixture, 'ancestor-link');
  await symlink(fixture, ancestorLink);
  await assert.rejects(loadRun(id, join(ancestorLink, 'runs')), /QA paths must not contain symlinks/);

  const manifestRoot = join(fixture, 'manifest-link-root');
  await mkdir(join(manifestRoot, id), { recursive: true });
  await symlink(join(directory, 'manifest.json'), join(manifestRoot, id, 'manifest.json'));
  await assert.rejects(loadRun(id, manifestRoot), { code: 'ELOOP' });
});
