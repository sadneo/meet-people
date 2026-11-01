// Operator-only adapter. This seeds surrounding fixtures, NEVER the two agents'
// accounts. Those accounts register and onboard through the real browser UI.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { inventory } from './docker.mjs';
import { repository, privateJson } from './state.mjs';

async function sql(run, source, user = 'postgres') {
  const { containers } = await inventory(run);
  const db = containers.find(container => container.Name === `/supabase_db_${run.projectId}`);
  if (!db?.State.Running) throw new Error('Verified QA database container required.');
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', db.Id, 'psql', '-X', '-qAt', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`QA fixture SQL failed: ${error.slice(-1200)}`)));
    child.stdin.end(source);
  });
}

export async function configureMapsSigning(run, runtime) {
  if (!/^[a-f0-9]{64}$/.test(runtime.signingKey) || runtime.supabaseUrl !== `http://127.0.0.1:${run.ports.supabase}`) {
    throw new Error('Invalid QA Maps signing configuration.');
  }
  const before = await sql(run, 'select count(*) from location_private.map_signing_key;');
  await sql(run, `insert into location_private.map_signing_key(singleton,secret)
    values(true,decode('${runtime.signingKey}','hex')) on conflict(singleton) do update set secret=excluded.secret;`);
  return { previouslyConfigured: before !== '0', configured: true };
}

export async function seedFixtures(run, runtime) {
  const backgroundCount = run.count - (run.uiUsers ?? 2);
  if (backgroundCount === 0) throw new Error('UI-only runs must never call the background fixture adapter.');
  const { developmentDemoPlan, seedMarker } = await import(join(repository, 'scripts/demo-seed/plan.ts'));
  const { demoInitialsPhoto } = await import(join(repository, 'scripts/demo-seed/photos.ts'));
  const { seedSql } = await import(join(repository, 'scripts/demo-seed/sql.ts'));
  const { scenarioSql } = await import(join(repository, 'scripts/demo-seed/scenarios.ts'));
  const profiles = developmentDemoPlan(Math.max(2, backgroundCount)).slice(0, backgroundCount);
  const url = `http://127.0.0.1:${run.ports.supabase}`;
  if (runtime.supabaseUrl !== url || !run.projectId.startsWith('pebble-qa-')) throw new Error('Fixture target is not this isolated QA run.');
  const client = createClient(url, runtime.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      if (new URL(String(input)).origin !== url) throw new Error('Non-QA fixture request refused.');
      return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.timeout(20000) });
    } },
  });
  // An empty fixture DB can safely use its publisher role without modifying any
  // role membership on the normal development database.
  await sql(run, 'grant pebble_location_catalog_publisher to postgres;');
  await sql(run, await readFile(join(repository, 'supabase/schema-sources/stony-brook-demo-location.sql'), 'utf8'));
  const photos = new Map();
  for (const profile of profiles) {
    const found = await client.auth.admin.getUserById(profile.id);
    if (found.error && found.error.status !== 404) throw new Error('Cannot inspect QA fixture identity.');
    if (found.data.user) {
      if (found.data.user.email !== profile.email || found.data.user.app_metadata.pebble_demo_seed !== seedMarker
        || found.data.user.app_metadata.pebble_qa_run !== run.id) throw new Error('Fixture identity is not owned by this QA run.');
    } else {
      const created = await client.auth.admin.createUser({ id: profile.id, email: profile.email,
        password: randomBytes(32).toString('base64url') + '-Aa1!', email_confirm: true,
        app_metadata: { pebble_demo_seed: seedMarker, pebble_qa_run: run.id } });
      if (created.error) throw new Error(`QA fixture Auth creation failed at ${profile.index}.`);
    }
    photos.set(profile.id, (await demoInitialsPhoto(profile)).toString('base64'));
  }
  await sql(run, seedSql(profiles, photos));
  if (profiles.length >= 6) await sql(run, scenarioSql(profiles.length));
  const counts = JSON.parse(await sql(run, `select json_build_object(
    'fixtures',(select count(*) from auth.users where raw_app_meta_data->>'pebble_qa_run'='${run.id}'),
    'messages',(select count(*) from public.messages),
    'events',(select count(*) from public.listings where listing_type='event'),
    'agentAccounts',(select count(*) from auth.users where email like 'qa-%@example.test'));`));
  if (counts.fixtures !== backgroundCount || counts.agentAccounts !== 0) throw new Error('Unexpected QA fixture readback. UI accounts must start unregistered.');
  await privateJson(join(run.directory, 'fixtures.json'), { ...counts, note: 'All remaining users must register and onboard in the UI.' });
  return counts;
}
