import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdir, open, readdir, rm, rmdir, lstat, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { runsRoot, repository, portsFor, projectFor, privateJson, readJson, saveRun, publicRun, loadRun, processInfo, validateUiUsers } from './state.mjs';
import { createPlan, initialBatch } from './batch-state.mjs';
import { docker, inventory, imageInventory, stopContainers, removeResources } from './docker.mjs';
import { prepareStack, localCliEnvironment, redact } from './config.mjs';
import { startService, stopServices, stopSetup, waitFor } from './processes.mjs';
import { seedFixtures } from './fixtures.mjs';

const execute = promisify(execFile);
const supabaseEntry = createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
// Supabase's npm package may export only package.json. Use the installed .bin
// executable through pnpm instead of downloading or resolving a new version.
export async function preflight() {
  if (process.platform !== 'linux') throw new Error('This initial harness supports Linux process-ownership checks only.');
  const { chromium } = await import('@playwright/test');
  await lstat(chromium.executablePath()).catch(() => { throw new Error('Existing Playwright Chromium is required. No browser will be downloaded automatically.'); });
  await docker(['info', '--format', '{{.ServerVersion}}']);
  return { packagesInstalled: false, browser: 'existing Chromium', browserExecutable: chromium.executablePath(), runtimeRoot: runsRoot, platform: process.platform };
}

async function checkPorts(run) {
  for (const port of Object.values(run.ports)) {
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error(`Port ${port} is occupied. Choose another --slot (0–9). No existing service was stopped.`)));
      server.listen(port, '127.0.0.1', () => server.close(resolve));
    });
  }
}

export async function createRun({ count = 100, slot = 0, uiUsers = 2 } = {}) {
  if (!Number.isInteger(count) || count < 4 || count > 100) throw new Error('Use 4–100 total users.');
  validateUiUsers(count, uiUsers);
  const ports = portsFor(slot);
  await preflight();
  await mkdir(runsRoot, { recursive: true, mode: 0o700 });
  const root = await lstat(runsRoot);
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid()) throw new Error('Untrusted run root.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '-');
  const id = `${stamp}-${randomBytes(4).toString('hex')}`;
  const directory = join(runsRoot, id);
  await mkdir(directory, { mode: 0o700 });
  const run = { version: 1, id, repository, directory, projectId: projectFor(id), workdir: join(directory, 'stack'),
    count, uiUsers, slot, ports, state: 'created', createdAt: new Date().toISOString(), services: [],
    imagesBefore: await imageInventory(), imageRefs: [] };
  await saveRun(run);
  for (const name of ['logs', 'tmp', 'cache', 'config', 'data', 'state', 'env', 'control', 'agents', 'fixtures']) {
    await mkdir(join(directory, name), { mode: 0o700 });
  }
  const actors = Object.fromEntries(['a', 'b'].map((role, index) => [role, {
    email: `qa-${role}-${id}@example.test`, password: randomBytes(24).toString('base64url') + '-Aa1!',
    name: index ? 'QA Blair' : 'QA Avery', username: `qa_${role}_${id.slice(-8)}`, birthdate: '2000-01-01',
  }]));
  await privateJson(join(directory, 'actors.json'), actors);
  if (uiUsers > 2) {
    const plan = createPlan(run);
    await privateJson(join(directory, 'batch-plan.json'), plan);
    await privateJson(join(directory, 'batch.json'), initialBatch(run));
    await privateJson(join(directory, 'actors.json'), { a: plan.users[0], b: plan.users[1] });
  }
  await privateJson(join(directory, 'secrets.json'), { jwt: randomBytes(40).toString('base64url'), signingKey: randomBytes(32).toString('hex') });
  const { stdout: commit } = await execute('git', ['rev-parse', 'HEAD'], { cwd: repository });
  await privateJson(join(directory, 'source.json'), { commit: commit.trim(), capturedAt: new Date().toISOString() });
  return run;
}

async function command(run, args, logName, { json = false } = {}) {
  const env = await localCliEnvironment(run);
  const secrets = await readJson(join(run.directory, 'secrets.json'));
  env.SUPABASE_AUTH_JWT_SECRET = secrets.jwt;
  const log = await open(join(run.directory, 'logs', logName), 'a', 0o600);
  try {
    const child = spawn(process.execPath, [supabaseEntry, '--workdir', run.workdir, ...args], {
      cwd: run.workdir, env, detached: true, stdio: ['ignore', json ? 'pipe' : log.fd, log.fd],
    });
    const completed = new Promise((resolve, reject) => {
      let output = '';
      if (json) child.stdout.on('data', data => { output += data; });
      const interrupt = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
      process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt);
        if (code !== 0) reject(new Error(`Supabase command failed (${signal ?? code}). Inspect ${join(run.directory, 'logs', logName)}; do not publish its keys.`));
        else {
          try { resolve(json ? JSON.parse(output) : undefined); }
          catch (error) { reject(new Error('Supabase returned invalid status JSON; private logs retained.', { cause: error })); }
        }
      });
    });
    // Register exit/error listeners before recording the subprocess; status can
    // finish quickly. This record also allows purge after a killed parent CLI.
    completed.catch(() => {});
    const info = await processInfo(child.pid);
    if (info) { run.setup = { pid: child.pid, start: info.start }; await saveRun(run); }
    return await completed;
  } finally { delete run.setup; await saveRun(run); await log.close(); }
}

async function rememberImages(run) {
  const resources = await inventory(run);
  run.imageRefs = [...new Set([...run.imageRefs, ...resources.containers.map(container => container.Config.Image)])];
  await saveRun(run);
  return resources;
}

async function waitForContainers(run) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const { containers } = await inventory(run);
    if (containers.length && containers.every(container => container.State.Running
      && (!container.State.Health || container.State.Health.Status === 'healthy'))) return;
    if (containers.some(container => !container.State.Running || container.State.Health?.Status === 'unhealthy')) throw new Error('A QA container failed its health check. Private startup logs retained.');
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('QA containers did not become healthy within two minutes.');
}

export async function startRun(run, maps = {}) {
  if (run.state === 'running') throw new Error('Run is already running. Use status or agent commands.');
  await checkPorts(run);
  run.state = 'starting'; await saveRun(run);
  try {
    await prepareStack(run);
    const resources = await inventory(run);
    if (!resources.networks.length) {
      await docker(['network', 'create', '--label', `com.supabase.cli.project=${run.projectId}`,
        '--label', `com.supabase.cli.workdir=${run.workdir}`,
        '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', `supabase_network_${run.projectId}`]);
    }
    if (resources.containers.length) {
      await docker(['start', ...resources.containers.map(container => container.Id)]);
    } else {
      await command(run, ['start', '--network-id', `supabase_network_${run.projectId}`, '--exclude',
        'studio,postgres-meta,edge-runtime,logflare,vector,supavisor'], 'supabase.log');
    }
    await waitFor(`http://127.0.0.1:${run.ports.supabase}/auth/v1/health`, 90000);
    await waitForContainers(run);
    const ready = await rememberImages(run);
    for (const container of ready.containers) {
      for (const bindings of Object.values(container.NetworkSettings.Ports ?? {})) {
        if (bindings?.some(binding => binding.HostIp !== '127.0.0.1')) throw new Error('Supabase published a non-loopback port; refusing to leave it running.');
      }
    }
    const status = await command(run, ['status', '--output', 'json'], 'status.log', { json: true });
    if (status.API_URL !== `http://127.0.0.1:${run.ports.supabase}` || !status.ANON_KEY || !status.SERVICE_ROLE_KEY) throw new Error('Unexpected QA Supabase target.');
    const secrets = await readJson(join(run.directory, 'secrets.json'));
    let previousRuntime;
    try { previousRuntime = await readJson(join(run.directory, 'runtime.json')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const runtime = { supabaseUrl: status.API_URL, publicKey: status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY, signingKey: secrets.signingKey,
      browserExecutable: (await preflight()).browserExecutable, ...maps };
    if (runtime.mapsServerKey && maps.mapsRequestLimit === undefined) runtime.mapsRequestLimit = previousRuntime?.mapsRequestLimit ?? 100;
    await privateJson(join(run.directory, 'runtime.json'), runtime);
    if (runtime.mapsServerKey) {
      const { configureMapsSigning } = await import('./fixtures.mjs');
      await configureMapsSigning(run, runtime);
    }
    try { await readJson(join(run.directory, 'fixtures.json')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const backgroundCount = run.count - (run.uiUsers ?? 2);
      if (backgroundCount === 0) {
        await privateJson(join(run.directory, 'fixtures.json'), { fixtures: 0, note: 'UI-only run: no auth/profile/background fixtures or demo location seed.' });
      } else {
        console.log(`Seeding ${backgroundCount} background fixtures; all UI users stay unregistered.`);
        await seedFixtures(run, runtime);
      }
    }
    // Keep upload files in the run, never allow agents arbitrary filesystem access.
    const { default: sharp } = await import('sharp');
    await sharp({ create: { width: 120, height: 120, channels: 3, background: '#e8d9ca' } }).png().toFile(join(run.directory, 'fixtures/avatar.png'));
    for (const role of ['api', 'web']) await startService(run, role, runtime);
    await waitFor(`http://127.0.0.1:${run.ports.api}/api/health`);
    await waitFor(`http://127.0.0.1:${run.ports.web}/login`);
    for (const role of (run.uiUsers ?? 2) > 2 ? [] : ['a', 'b']) {
      await startService(run, role, runtime);
      const deadline = Date.now() + 30000;
      let control;
      while (Date.now() < deadline) {
        try {
          control = await readJson(join(run.directory, 'control', `${role}.json`));
          const response = await fetch(`http://127.0.0.1:${control.port}/action`, { method: 'POST', headers: { Authorization: `Bearer ${control.token}`, 'Content-Type': 'application/json' }, body: '{"method":"viewport","width":390,"height":844}', signal: AbortSignal.timeout(2000) });
          if (response.ok) break;
          control = null;
        } catch { control = null; }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      if (!control) throw new Error(`Browser ${role} did not become ready. Inspect private logs.`);
    }
    run.state = 'running'; await saveRun(run);
    return publicRun(run);
  } catch (error) {
    try { await rememberImages(run); await stopServices(run); await stopContainers(run); }
    catch { console.error('Some resources could not be stopped. Run purge with this run ID to retry safely.'); }
    run.state = 'failed'; await saveRun(run);
    throw error;
  }
}

export async function stopRun(run) {
  await stopSetup(run);
  await rememberImages(run);
  await stopServices(run);
  await stopContainers(run);
  run.state = 'stopped'; await saveRun(run);
  return publicRun(run);
}

export async function purgeRun(run, { images = false } = {}) {
  await stopRun(run);
  const result = await removeResources(run, images);
  // Refuse a changed/symlinked manifest directory before recursively deleting the
  // one explicit owned run path. Never rm the parent, the repository or /tmp.
  await loadRun(run.id);
  return { ...result, deleteDirectory: run.directory };
}

export async function deleteRunDirectory(run) {
  await loadRun(run.id);
  await rm(run.directory, { recursive: true });
  await rmdir(runsRoot).catch(error => { if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error; });
}

export async function listRuns() {
  let names;
  try { names = await readdir(runsRoot); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return Promise.all(names.filter(name => /^\d{8}-\d{6}-[a-f0-9]{8}$/.test(name)).map(async name => publicRun(await loadRun(name))));
}

export async function showLog(run, role) {
  if (!['api', 'web', 'a', 'b', 'supabase'].includes(role)) throw new Error('Unknown log role.');
  return redact((await readFile(join(run.directory, 'logs', `${role}.log`), 'utf8')).slice(-12000), run);
}
