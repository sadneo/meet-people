import { mkdir, lstat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { readJson, privateJson, processInfo } from './state.mjs';
import { nextPair, pairActors, userDirectory } from './batch-state.mjs';
import { startService, stopServices, ownsService } from './processes.mjs';
import { smoke } from './journeys.mjs';

export function validatePairLimit(pairs) {
  if (!Number.isInteger(pairs) || pairs < 1 || pairs > 50) throw new Error('--pairs must be an integer from 1 to 50 (sequential pairs, never concurrency).');
  return pairs;
}

export async function reservePair(run, pair) {
  const actors = await pairActors(run, pair);
  for (const actor of Object.values(actors)) {
    try { await lstat(userDirectory(run, actor.ordinal)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error('Untouched pair already has user evidence; refusing replay or overwrite.');
  }
  await mkdir(join(run.directory, 'batches'), { recursive: true, mode: 0o700 });
  const directory = join(run.directory, 'batches', `pair-${String(pair).padStart(3, '0')}`);
  // Exclusive directory reservation: never overwrite an earlier attempted pair.
  await mkdir(directory, { mode: 0o700 });
  return { actors, outputPath: join(directory, 'results.json') };
}

async function ready(run, role) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const control = await readJson(join(run.directory, 'control', `${role}.json`));
      if (control.port !== run.ports[role === 'a' ? 'agentA' : 'agentB'] || !/^[a-f0-9]{64}$/.test(control.token)) throw new Error('Invalid controller identity.');
      const response = await fetch(`http://127.0.0.1:${control.port}/action`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2000),
        headers: { Authorization: `Bearer ${control.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'viewport', width: role === 'a' ? 390 : 320, height: 844 }),
      });
      if (response.ok) return;
    } catch { /* Bounded startup readiness only; never retry registration. */ }
    await delay(200);
  }
  throw new Error(`Browser ${role} did not become ready.`);
}

export async function batch(run, { pairs = 1, resume = false } = {}) {
  validatePairLimit(pairs);
  if ((run.uiUsers ?? 2) <= 2) throw new Error('Batch requires a new run with --ui-users greater than 2. Existing two-agent runs use smoke/agent.');
  if (run.state !== 'running') throw new Error('Start this QA run first.');
  const path = join(run.directory, 'batch.json');
  const state = await readJson(path);
  const first = nextPair(run, state, resume);
  if (first === null) return { ok: true, completed: true, evidence: path };
  const runtime = await readJson(join(run.directory, 'runtime.json'));
  for (const role of ['api', 'web']) {
    const service = run.services.find(item => item.role === role);
    const info = service && await processInfo(service.pid);
    if (!service || info?.start !== service.start || !ownsService(info, run, role)) throw new Error(`Owned ${role} must remain running for the entire batch.`);
  }
  // The app quota is in-memory. Do not resume paid batches after an API restart
  // (which would reset it), even if the database and finished pairs survived.
  const api = run.services.find(item => item.role === 'api');
  if (runtime.mapsServerKey && state.mapsApi && JSON.stringify(state.mapsApi) !== JSON.stringify(api)) throw new Error('Maps batch API identity changed; refusing to reset/bypass its request quota.');
  if (runtime.mapsServerKey) state.mapsApi = api;
  const end = Math.min(first + pairs - 1, state.pairs.length);
  for (let index = first; index <= end; index++) {
    await stopServices(run, ['a', 'b']);
    const { actors, outputPath } = await reservePair(run, index);
    const pair = state.pairs[index - 1];
    pair.status = 'running'; pair.startedAt = new Date().toISOString();
    await privateJson(path, state); // Durable BEFORE any browser or signup can start.
    try {
      await privateJson(join(run.directory, 'actors.json'), actors);
      for (const role of ['a', 'b']) {
        await unlink(join(run.directory, 'control', `${role}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        await startService(run, role, runtime);
        await ready(run, role);
      }
      const result = await smoke(run, { outputPath, profilePersistence: true, logout: true, stopOnFailure: true,
        onProgress: async user => {
          const target = pair.users.find(item => item.ordinal === user.ordinal);
          if (!target) throw new Error('Journey returned an unplanned actor.');
          Object.assign(target, { status: user.status, stages: [...user.stages], failedStage: user.failedStage, error: user.error });
          await privateJson(path, state);
        } });
      pair.status = result.ok && pair.users.every(user => user.status === 'passed') ? 'passed' : 'failed';
      pair.finishedAt = new Date().toISOString();
    } catch (error) {
      pair.status = 'failed'; pair.error = error.message;
    } finally {
      try { await stopServices(run, ['a', 'b']); }
      catch (error) { pair.status = 'failed'; pair.teardownError = error.message; }
      await privateJson(path, state);
    }
    const completedUsers = state.pairs.flatMap(item => item.users).filter(user => user.status === 'passed').length;
    console.log(`UI pair ${index}/${state.pairs.length}: ${pair.status}; ${completedUsers}/${run.uiUsers} users passed.`);
    if (pair.status !== 'passed') return { ok: false, completedUsers, stoppedAtPair: index, evidence: path, pair };
  }
  return { ok: true, completedPairs: state.pairs.filter(pair => pair.status === 'passed').length,
    totalPairs: state.pairs.length, completed: end === state.pairs.length, coverage: state.coverage, evidence: path };
}
