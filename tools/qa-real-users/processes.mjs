import { spawn } from 'node:child_process';
import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { repository, tooling, processInfo, saveRun } from './state.mjs';
import { serviceEnvironment } from './config.mjs';

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const tsxLoader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
export function ownsService(info, run, role) {
  return !!info && info.group === info.pid
    && JSON.stringify(info.command) === JSON.stringify([process.execPath, '--import', tsxLoader, join(tooling, 'service.mjs'), role, run.id]);
}

export async function startService(run, role, runtime) {
  const previous = run.services.find(service => service.role === role);
  if (previous) {
    const info = await processInfo(previous.pid);
    if (info?.start === previous.start) throw new Error(`QA ${role} is already running.`);
    run.services = run.services.filter(service => service.role !== role);
  }
  const log = await open(join(run.directory, 'logs', `${role}.log`), 'a', 0o600);
  try {
    const child = spawn(process.execPath, ['--import', tsxLoader, join(tooling, 'service.mjs'), role, run.id], {
      cwd: run.directory, env: serviceEnvironment(run, runtime), detached: true,
      stdio: ['ignore', log.fd, log.fd],
    });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const info = await processInfo(child.pid);
    if (!info) throw new Error(`QA ${role} exited before ownership could be recorded.`);
    run.services.push({ role, pid: child.pid, start: info.start });
    await saveRun(run);
    child.unref();
  } finally { await log.close(); }
}

async function descendants(root) {
  const processes = (await Promise.all((await readdir('/proc')).filter(name => /^\d+$/.test(name)).map(name => processInfo(Number(name))))).filter(Boolean);
  const owned = new Set([root]);
  let previous = 0;
  while (previous !== owned.size) {
    previous = owned.size;
    for (const process of processes) if (owned.has(process.parent)) owned.add(process.pid);
  }
  return processes.filter(process => owned.has(process.pid));
}

export async function stopSetup(run) {
  if (!run.setup) return;
  const info = await processInfo(run.setup.pid);
  if (info?.start === run.setup.start && info.state !== 'Z') {
    const executable = createRequire(import.meta.url).resolve('supabase/dist/supabase.js');
    if (info.group !== info.pid || !info.command.includes(executable) || !info.command.includes(run.workdir)) throw new Error('Setup process ownership changed.');
    const tree = await descendants(info.pid);
    try { process.kill(-info.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await delay(500);
    for (const child of tree.reverse()) {
      const live = await processInfo(child.pid);
      if (live?.start === child.start) {
        try { process.kill(child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  }
  delete run.setup; await saveRun(run);
}

export async function stopServices(run, roles = ['api', 'web', 'a', 'b']) {
  if (!Array.isArray(roles) || roles.some(role => !['api', 'web', 'a', 'b'].includes(role))) throw new Error('Invalid service roles.');
  // Capture descendants before stopping parents, including Chromium's detached
  // subprocesses. PID birth times fence against PID reuse; no pkill patterns.
  for (const service of [...run.services].reverse()) {
    if (!roles.includes(service.role)) continue;
    const info = await processInfo(service.pid);
    if (!info || info.start !== service.start || info.state === 'Z') continue;
    if (!ownsService(info, run, service.role)) throw new Error('Process ownership changed; refusing to signal it.');
    const tree = await descendants(info.pid);
    try { process.kill(info.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const live = await processInfo(info.pid);
      if (!live || live.start !== info.start || live.command.length === 1 && !live.command[0]) break;
      await delay(100);
    }
    for (const child of tree.reverse()) {
      const live = await processInfo(child.pid);
      if (live?.start === child.start) {
        try { process.kill(child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  }
  run.services = run.services.filter(service => !roles.includes(service.role));
  await saveRun(run);
}

export async function waitFor(url, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: 'error' });
      if (response.ok) return;
    } catch { /* Startup readiness polling, not application retries. */ }
    await delay(200);
  }
  throw new Error(`Service did not become ready: ${new URL(url).origin}. See this run's private logs.`);
}

export const sourceRoot = repository;
