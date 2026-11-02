import { readFile, readdir, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { repository, tooling } from './state.mjs';

export function supabaseConfig(run) {
  const p = run.ports, origin = `http://127.0.0.1:${p.web}`;
  return `project_id = "${run.projectId}"
[api]
enabled = true
port = ${p.supabase}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000
[db]
port = ${p.db}
shadow_port = ${p.shadow}
major_version = 17
health_timeout = "2m"
[db.pooler]
enabled = false
port = ${p.pooler}
[db.migrations]
enabled = true
schema_paths = []
[db.seed]
enabled = false
sql_paths = []
[realtime]
enabled = true
[studio]
enabled = false
port = ${p.studio}
[local_smtp]
enabled = true
port = ${p.mail}
[storage]
enabled = true
file_size_limit = "50MiB"
[auth]
enabled = true
site_url = "${origin}"
additional_redirect_urls = ["${origin}/auth/callback**", "${origin}/reset-password"]
jwt_expiry = 3600
enable_signup = true
enable_anonymous_sign_ins = false
minimum_password_length = 8
[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = true
${(run.uiUsers ?? 2) > 2 ? `# QA-only finite limits for this isolated project, never global/hosted config.
[auth.rate_limit]
email_sent = 300
sign_in_sign_ups = 300
token_verifications = 150
` : ''}
[edge_runtime]
enabled = false
[analytics]
enabled = false
`;
}

export async function prepareStack(run) {
  const directory = join(run.workdir, 'supabase'), migrations = join(directory, 'migrations');
  await mkdir(migrations, { recursive: true, mode: 0o700 });
  await writeFile(join(directory, 'config.toml'), supabaseConfig(run), { mode: 0o600 });
  // Snapshot the branch's native UUID schema. Never invoke dev's fixed-project
  // start/reset/seed helpers or write anything into its worktree.
  for (const name of (await readdir(join(repository, 'supabase/migrations'))).sort()) {
    if (name.endsWith('.sql')) await copyFile(join(repository, 'supabase/migrations', name), join(migrations, name));
  }
  await copyFile(join(tooling, 'sql/public-event-reads.sql'), join(migrations, '20990101000000_qa_event_reads.sql'));
  await writeFile(join(run.directory, 'SCHEMA.txt'), (await readdir(migrations)).sort().join('\n') + '\n', { mode: 0o600 });
}

export function validateMapsBudget(enabled, budget) {
  if (budget !== undefined && (!enabled || !Number.isInteger(budget) || budget < 1 || budget > 1000)) throw new Error('--maps-budget requires --maps and an integer from 1 to 1000.');
  return budget;
}

export async function mapsSettings(enabled, budget) {
  validateMapsBudget(enabled, budget);
  if (!enabled) return {};
  const env = parseEnv(await readFile(join(repository, '.env.local'), 'utf8'));
  if (!env.VITE_GOOGLE_MAPS_API_KEY || !env.GOOGLE_MAPS_SERVER_API_KEY || env.GOOGLE_MAPS_STORAGE_APPROVED !== 'true') {
    throw new Error('Maps opt-in requires both Google Maps keys and GOOGLE_MAPS_STORAGE_APPROVED=true in .env.local.');
  }
  return { mapsBrowserKey: env.VITE_GOOGLE_MAPS_API_KEY, mapsServerKey: env.GOOGLE_MAPS_SERVER_API_KEY, ...(budget === undefined ? {} : { mapsRequestLimit: budget }) };
}

export function serviceEnvironment(run, runtime) {
  validateMapsBudget(!!runtime.mapsServerKey, runtime.mapsRequestLimit);
  // Do not inherit .env.local, shell provider keys, development credentials,
  // cloud CLI configuration or an ambient database target.
  const keep = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'SHELL', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR'];
  const env = Object.fromEntries(keep.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  return { ...env, NODE_ENV: 'development', TMPDIR: join(run.directory, 'tmp'),
    XDG_CACHE_HOME: join(run.directory, 'cache'), XDG_CONFIG_HOME: join(run.directory, 'config'),
    XDG_DATA_HOME: join(run.directory, 'data'), XDG_STATE_HOME: join(run.directory, 'state'),
    PORT: String(run.ports.api), API_PORT: String(run.ports.api),
    CORS_ORIGINS: `http://127.0.0.1:${run.ports.web}`,
    ...((run.uiUsers ?? 2) > 2 ? { QA_RUN_ID: run.id, QA_AUTH_EMAIL_REQUESTS_PER_WINDOW: '300' } : {}),
    SUPABASE_URL: runtime.supabaseUrl, SUPABASE_PUBLISHABLE_KEY: runtime.publicKey,
    SUPABASE_SERVICE_ROLE_KEY: runtime.serviceKey,
    VITE_SUPABASE_URL: runtime.supabaseUrl, VITE_SUPABASE_PUBLISHABLE_KEY: runtime.publicKey,
    SEARCH_LOCATION_SIGNING_KEY: runtime.signingKey, GOOGLE_MAPS_STORAGE_APPROVED: runtime.mapsServerKey ? 'true' : 'false',
    ...(runtime.mapsServerKey ? { GOOGLE_MAPS_SERVER_API_KEY: runtime.mapsServerKey, VITE_GOOGLE_MAPS_API_KEY: runtime.mapsBrowserKey,
      GOOGLE_MAPS_REQUESTS_PER_DAY: String(runtime.mapsRequestLimit ?? 100), QA_MAPS_ENABLED: 'true' } : {}),
    QA_CHROMIUM_EXECUTABLE_PATH: runtime.browserExecutable ?? '' };
}

export async function localCliEnvironment(run) {
  const env = serviceEnvironment(run, { supabaseUrl: `http://127.0.0.1:${run.ports.supabase}`, publicKey: '', serviceKey: '', signingKey: '' });
  // CLI download/telemetry/temp files are contained in the run. The installed
  // Supabase executable and shared Docker image store are reused, not installed.
  env.XDG_CONFIG_HOME = join(run.directory, 'config');
  env.XDG_DATA_HOME = join(run.directory, 'data');
  env.SUPABASE_TELEMETRY_DISABLED = 'true';
  return env;
}

export async function redact(text, run) {
  let result = String(text);
  for (const name of ['runtime.json', 'actors.json', 'batch-plan.json', 'control/a.json', 'control/b.json']) {
    try {
      const value = JSON.parse(await readFile(join(run.directory, name), 'utf8'));
      const secrets = name === 'batch-plan.json' ? value.users.map(actor => actor.password)
        : name === 'actors.json' ? Object.values(value).map(actor => actor.password)
        : Object.entries(value).filter(([key]) => /key|token/i.test(key)).map(([, secret]) => secret);
      for (const secret of secrets) if (typeof secret === 'string' && secret.length > 5) result = result.split(secret).join('[REDACTED]');
    } catch { /* A failed start might not have generated credentials. */ }
  }
  return result.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[JWT REDACTED]');
}
