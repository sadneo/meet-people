// A process identity marker and graceful shutdown boundary for each owned service.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadRun, readJson, repository } from './state.mjs';

const [role, id] = process.argv.slice(2);
const run = await loadRun(id);
if (!['api', 'web', 'a', 'b'].includes(role)) throw new Error('Unknown QA service.');
process.umask(0o077);
let close = async () => {}, stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  try { await close(); } finally { process.exit(0); }
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
process.on('unhandledRejection', () => { console.error('QA service stopped after an unhandled rejection; see private artifacts.'); void stop(); });
if (role === 'api') {
  const { app } = await import(pathToFileURL(join(repository, 'api/index.ts')).href);
  const server = app.listen(run.ports.api, '127.0.0.1');
  close = () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
  server.on('error', error => { console.error(error.code ?? 'API startup failed'); process.exit(1); });
} else if (role === 'web') {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const runtime = await readJson(join(run.directory, 'runtime.json'));
  const server = await createServer({
    configFile: false, root: repository, envDir: join(run.directory, 'env'),
    cacheDir: join(run.directory, 'cache/vite'), plugins: [react()],
    define: { 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(runtime.supabaseUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(runtime.publicKey) },
    server: { host: '127.0.0.1', port: run.ports.web, strictPort: true,
      proxy: { '/api': `http://127.0.0.1:${run.ports.api}` } },
  });
  close = () => server.close();
  await server.listen();
} else {
  const { startAgent } = await import('./browser.mjs');
  close = await startAgent(run, role);
}
console.log(`QA ${role} ready for ${id}.`);
