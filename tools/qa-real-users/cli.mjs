#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { join } from 'node:path';
import { readJson, privateJson, loadRun, withLock, publicRun, agentNames } from './state.mjs';
import { inventory } from './docker.mjs';
import { createRun, preflight, startRun, stopRun, purgeRun, deleteRunDirectory, listRuns, showLog } from './lifecycle.mjs';
import { validateMapsBudget } from './config.mjs';
import { userDirectory } from './batch-state.mjs';

const usage = `Real-user QA (no packages are installed)

pnpm exec tsx tools/qa-real-users/cli.mjs preflight
pnpm exec tsx tools/qa-real-users/cli.mjs up [--count 100] [--slot 0]
pnpm exec tsx tools/qa-real-users/cli.mjs up --count 100 --ui-users 100 [--maps --maps-budget 300]
pnpm exec tsx tools/qa-real-users/cli.mjs batch RUN_ID [--pairs 1] [--resume]
pnpm exec tsx tools/qa-real-users/cli.mjs list
pnpm exec tsx tools/qa-real-users/cli.mjs status RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs up RUN_ID [--maps] # resume; opt in to paid Maps
pnpm exec tsx tools/qa-real-users/cli.mjs smoke RUN_ID    # real signup/login/onboarding
pnpm exec tsx tools/qa-real-users/cli.mjs brief RUN_ID a|b
pnpm exec tsx tools/qa-real-users/cli.mjs agent RUN_ID a|b look
pnpm exec tsx tools/qa-real-users/cli.mjs agent RUN_ID a|b < action.json
pnpm exec tsx tools/qa-real-users/cli.mjs log RUN_ID api|web|a|b|supabase
pnpm exec tsx tools/qa-real-users/cli.mjs report RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs stop RUN_ID
pnpm exec tsx tools/qa-real-users/cli.mjs purge RUN_ID [--images] [--dry-run]

All generated files stay in /tmp/opencode/pebble-qa/RUN_ID.
--images removes only images absent before this run and unused by other containers.
No --all, global prune, dev-stack resets, credential injection or automatic fixes.
--ui-users defaults to 2; an even number <= count. Background count = count - ui-users.
batch runs sequential pairs (max 2 contexts), defaults to one pair, stops on failure.
--resume explicitly continues completed pairs only; partial/failed pairs cannot replay.
Batch is scripted coverage, not 100 autonomous AI explorers. Discovery is not covered.
--maps-budget requires --maps; 1–1000 server requests/process/day, NOT a billing cap.
`;

async function action(run, role, input) {
  if (!agentNames.includes(role)) throw new Error('Choose actor a or b.');
  if (run.state !== 'running') throw new Error('Start this QA run first.');
  const control = await readJson(join(run.directory, 'control', `${role}.json`));
  if (control.port !== run.ports[role === 'a' ? 'agentA' : 'agentB'] || !/^[a-f0-9]{64}$/.test(control.token)) throw new Error('Invalid browser-controller credentials.');
  const response = await fetch(`http://127.0.0.1:${control.port}/action`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
    headers: { Authorization: `Bearer ${control.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? `Controller failed (${response.status}).`);
  return value;
}

async function report(run) {
  const output = { run: publicRun(run), maps: await mapsSummary(run), agents: {} };
  const directories = (run.uiUsers ?? 2) > 2
    ? Array.from({ length: run.uiUsers }, (_, i) => [`user-${String(i + 1).padStart(3, '0')}`, userDirectory(run, i + 1)])
    : agentNames.map(role => [role, join(run.directory, 'agents', role)]);
  for (const [role, directory] of directories) {
    const files = {};
    for (const name of ['findings', 'coverage', 'problems']) {
      try { files[name] = await readJson(join(directory, `${name}.json`)); }
      catch (error) { if (error.code !== 'ENOENT') throw error; files[name] = []; }
    }
    output.agents[role] = files;
  }
  try { output.smoke = await readJson(join(run.directory, 'smoke-results.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if ((run.uiUsers ?? 2) > 2) output.batch = await readJson(join(run.directory, 'batch.json'));
  output.note = 'Exploratory findings need independent reproduction. Missing coverage is not a pass. Private traces may include credentials; do not publish them.';
  await privateJson(join(run.directory, 'report.json'), output);
  return output;
}

async function mapsSummary(run) {
  try {
    const runtime = await readJson(join(run.directory, 'runtime.json'));
    return { enabled: !!runtime.mapsServerKey, serverRequestsPerProcessDay: runtime.mapsServerKey ? runtime.mapsRequestLimit ?? 100 : 0,
      note: 'Not a billing cap; browser Maps loads are excluded. Batch rotations never restart the API or reset its counter.' };
  } catch (error) { if (error.code !== 'ENOENT') throw error; return { enabled: false, runtimeNotStarted: true }; }
}

async function main() {
  process.umask(0o077);
  const { positionals, values } = parseArgs({ allowPositionals: true, options: {
    count: { type: 'string' }, 'ui-users': { type: 'string' }, slot: { type: 'string' }, maps: { type: 'boolean' }, 'maps-budget': { type: 'string' },
    pairs: { type: 'string' }, resume: { type: 'boolean' }, images: { type: 'boolean' }, 'dry-run': { type: 'boolean' }, help: { type: 'boolean' },
  } });
  const [command, id, role, method] = positionals;
  if (!command || values.help) { console.log(usage); return; }
  const argumentLimits = { preflight: 1, list: 1, up: 2, status: 2, stop: 2, purge: 2, agent: 4, smoke: 2, batch: 2, brief: 3, log: 3, report: 2 };
  if (!Object.hasOwn(argumentLimits, command) || positionals.length > argumentLimits[command]) throw new Error('Unknown command or extra arguments. Use --help.');
  if (values.maps && command !== 'up' || values.images && command !== 'purge' || values['dry-run'] && command !== 'purge'
    || (values.count !== undefined || values.slot !== undefined || values['ui-users'] !== undefined) && (command !== 'up' || id)
    || values['maps-budget'] !== undefined && command !== 'up'
    || (values.pairs !== undefined || values.resume) && command !== 'batch') throw new Error('Flags do not apply to this command.');
  validateMapsBudget(!!values.maps, values['maps-budget'] === undefined ? undefined : Number(values['maps-budget']));
  if (command === 'preflight') { console.log(JSON.stringify(await preflight(), null, 2)); return; }
  if (command === 'list') { console.log(JSON.stringify(await listRuns(), null, 2)); return; }
  const run = command === 'up' && !id ? await createRun({ count: values.count === undefined ? 100 : Number(values.count), uiUsers: values['ui-users'] === undefined ? 2 : Number(values['ui-users']), slot: values.slot === undefined ? 0 : Number(values.slot) }) : await loadRun(id);
  if ((run.uiUsers ?? 2) > 2 && ['smoke', 'agent', 'brief'].includes(command)) throw new Error('Batch runs use batch RUN_ID, not smoke/agent/brief; identities must not be registered outside durable pair progress.');
  console.log(`QA run: ${run.id}`);
  let result;
  if (command === 'up') {
    const { mapsSettings } = await import('./config.mjs');
    const maps = await mapsSettings(!!values.maps, values['maps-budget'] === undefined ? undefined : Number(values['maps-budget']));
    result = await withLock(run, () => startRun(run, maps));
  }
  else if (command === 'status') {
    const resources = await inventory(run);
    result = { ...publicRun(run), maps: await mapsSummary(run), containers: resources.containers.map(container => ({ name: container.Name, running: container.State.Running })), volumes: resources.volumes, networks: resources.networks };
    if ((run.uiUsers ?? 2) > 2) result.batch = await readJson(join(run.directory, 'batch.json'));
  } else if (command === 'stop') result = await withLock(run, () => stopRun(run));
  else if (command === 'purge') {
    if (values['dry-run']) {
      const resources = await inventory(run);
      result = { dryRun: true, directory: run.directory, processes: run.services,
        containers: resources.containers.map(container => container.Name), volumes: resources.volumes, networks: resources.networks,
        imagePolicy: values.images ? 'Only newly downloaded, unshared image references used by this run.' : 'Keep Docker images.' };
    } else result = await withLock(run, async () => {
      const cleaned = await purgeRun(run, { images: !!values.images });
      await deleteRunDirectory(run);
      return { ...cleaned, purged: true };
    });
  } else if (command === 'agent') {
    let input;
    if (method) { if (method !== 'look') throw new Error('Pass action JSON on stdin; only look is accepted as a positional action.'); input = { method }; }
    else {
      if (process.stdin.isTTY) throw new Error('Provide action JSON on stdin, or specify look.');
      let text = '';
      for await (const chunk of process.stdin) { text += chunk; if (text.length > 32768) throw new Error('Action exceeds 32KB.'); }
      input = JSON.parse(text);
    }
    result = await action(run, role, input);
  } else if (command === 'batch') {
    const { batch } = await import('./batch.mjs');
    result = await withLock(run, () => batch(run, { pairs: values.pairs === undefined ? 1 : Number(values.pairs), resume: !!values.resume }));
    if (!result.ok) process.exitCode = 1;
  } else if (command === 'smoke') {
    const { smoke } = await import('./journeys.mjs');
    result = await withLock(run, () => smoke(run));
    if (!result.ok) process.exitCode = 1;
    result = { ok: result.ok, results: result.results.map(({ role, status, stages, failedStage, error }) => ({ role, status, stages, failedStage, error })), evidence: join(run.directory, 'smoke-results.json') };
  } else if (command === 'brief') {
    if (!agentNames.includes(role)) throw new Error('Choose actor a or b.');
    const { readFile } = await import('node:fs/promises');
    const { tooling } = await import('./state.mjs');
    const prompt = await readFile(join(tooling, `agent-${role}.md`), 'utf8');
    console.log(prompt.replaceAll('{{RUN_ID}}', run.id).replaceAll('{{REPOSITORY}}', run.repository));
    return;
  } else if (command === 'log') { console.log(await showLog(run, role)); return; }
  else if (command === 'report') result = await report(run);
  else throw new Error('Unknown command. Use --help.');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
