import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, mkdir, open, readFile, realpath, rename, lstat, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const tooling = dirname(fileURLToPath(import.meta.url));
export const repository = resolve(tooling, '../..');
// Chromium uses Unix sockets with a ~108-byte path ceiling. A long repository
// checkout path cannot safely contain its profile/temp sockets. One fixed short
// root keeps every artifact discoverable and removable without scattered temp dirs.
export const runsRoot = '/tmp/opencode/pebble-qa';
export const runPattern = /^\d{8}-\d{6}-[a-f0-9]{8}$/;
export const agentNames = ['a', 'b'];

export function validateUiUsers(count, uiUsers = 2) {
  if (!Number.isInteger(uiUsers) || uiUsers < 2 || uiUsers > count || uiUsers % 2 !== 0) throw new Error('UI users must be an even integer from 2 to the total count.');
  return uiUsers;
}

export function portsFor(slot = 0) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 9) throw new Error('Slot must be 0–9.');
  const app = 3300 + slot * 20, db = 55420 + slot * 20;
  return { web: app, api: app + 1, agentA: app + 2, agentB: app + 3,
    shadow: db, supabase: db + 1, db: db + 2, studio: db + 3, mail: db + 4, pooler: db + 9 };
}

export function projectFor(id) {
  if (!runPattern.test(id)) throw new Error('Invalid run ID. Pass the ID, not a path.');
  return `pebble-qa-${id}`;
}

export async function privateJson(path, value) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.pending`;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    const file = await open(temporary, 'wx', 0o600);
    try { await file.writeFile(`${JSON.stringify(value, null, 2)}\n`); } finally { await file.close(); }
    await rename(temporary, path);
    await chmod(path, 0o600);
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export async function readJson(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024 || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600) throw new Error('Untrusted QA state file.');
    return JSON.parse(await file.readFile('utf8'));
  } finally { await file.close(); }
}

export function validateManifest(value, directory, root = runsRoot) {
  validateUiUsers(value.count, value.uiUsers === undefined ? 2 : value.uiUsers);
  if (value.version !== 1 || !runPattern.test(value.id) || value.projectId !== projectFor(value.id)
    || directory !== join(resolve(root), value.id) || value.directory !== directory
    || value.repository !== repository || value.workdir !== join(directory, 'stack')
    || !Number.isInteger(value.count) || value.count < 4 || value.count > 100
    || JSON.stringify(value.ports) !== JSON.stringify(portsFor(value.slot))
    || !Array.isArray(value.services) || !Array.isArray(value.imagesBefore) || !Array.isArray(value.imageRefs)
    || value.imagesBefore.some(image => typeof image !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(image))
    || value.imageRefs.some(ref => typeof ref !== 'string' || !/^(?:public\.ecr\.aws\/|docker\.io\/)?supabase\/[a-z0-9._/-]+:[a-zA-Z0-9._-]+$/.test(ref))) {
    throw new Error('Invalid manifest; refusing to manage any resources.');
  }
  for (const service of value.services) {
    if (!['api', 'web', 'a', 'b'].includes(service.role) || !Number.isInteger(service.pid)
      || service.pid <= 1 || typeof service.start !== 'string' || !/^\d+$/.test(service.start)) throw new Error('Invalid process ownership record.');
  }
  if (value.setup && (!Number.isInteger(value.setup.pid) || value.setup.pid <= 1
    || typeof value.setup.start !== 'string' || !/^\d+$/.test(value.setup.start))) throw new Error('Invalid setup process record.');
  return value;
}

export async function loadRun(id, root = runsRoot) {
  projectFor(id);
  const directory = join(resolve(root), id);
  for (const path of [root, directory]) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid()) throw new Error('Untrusted QA directory.');
  }
  if (await realpath(directory) !== directory) throw new Error('QA paths must not contain symlinks.');
  return validateManifest(await readJson(join(directory, 'manifest.json')), directory, root);
}

export async function saveRun(run) { await privateJson(join(run.directory, 'manifest.json'), run); }

export async function processInfo(pid) {
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    return { pid, state: fields[0], parent: Number(fields[1]), group: Number(fields[2]), start: fields[19],
      command: (await readFile(`/proc/${pid}/cmdline`, 'utf8')).split('\0').filter(Boolean) };
  } catch (error) { if (['ENOENT', 'ESRCH', 'EACCES'].includes(error.code)) return null; throw error; }
}

export async function withLock(run, operation) {
  const path = join(run.directory, 'operation.lock');
  let file;
  try { file = await open(path, 'wx', 0o600); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = await readJson(path), current = await processInfo(owner.pid);
    if (current && current.start === owner.start) throw new Error('Another QA lifecycle command is running. Wait for it or interrupt it first.', { cause: error });
    await unlink(path);
    file = await open(path, 'wx', 0o600);
  }
  try {
    const self = await processInfo(process.pid);
    await file.writeFile(JSON.stringify({ pid: process.pid, start: self.start }));
    return await operation();
  } finally { await file.close(); await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}

export function publicRun(run) {
  return { id: run.id, state: run.state, accounts: run.count, uiUsers: run.uiUsers ?? 2,
    backgroundUsers: run.count - (run.uiUsers ?? 2), coverageMode: (run.uiUsers ?? 2) > 2 ? 'scripted pair batches; not autonomous exploration' : 'two browser controllers; smoke or autonomous exploration', directory: run.directory,
    app: `http://127.0.0.1:${run.ports.web}`, mail: `http://127.0.0.1:${run.ports.mail}`,
    project: run.projectId, services: run.services.map(({ role, pid }) => ({ role, pid })) };
}
