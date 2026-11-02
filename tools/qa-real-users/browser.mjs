import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { access, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { readJson, privateJson } from './state.mjs';
import { evidenceHistory } from './evidence.mjs';
import { actorDirectory } from './batch-state.mjs';

// The trace is deliberately private: unlike the public action log it contains auth traffic.
export async function startAgent(run, role) {
  if (!['a', 'b'].includes(role)) throw new Error('Unknown actor');
  const actor = (await readJson(join(run.directory, 'actors.json')))[role];
  const directory = await actorDirectory(run, role, actor);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const origin = key => `http://127.0.0.1:${run.ports[key]}`;
  const web = origin('web'), mail = origin('mail'), auth = origin('supabase');
  const allowed = new Set(['web', 'api', 'supabase', 'mail'].map(origin));
  const mapsHosts = new Set(['maps.googleapis.com', 'maps.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com']);
  const filledValues = new Set();
  const scrub = value => {
    let text = String(value);
    for (const secret of [actor.password, actor.email, ...filledValues]) if (secret) text = text.split(secret).join('[redacted]');
    return text.replace(/(?:https?|wss?):\/\/[^\s<>"']+/g, raw => {
      try { const u = new URL(raw); return `${u.origin}${u.pathname}${u.search || u.hash ? '?[redacted]' : ''}`; } catch { return '[url]'; }
    }).replace(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?/g, '[token]')
      .replace(/((?:password|token|authorization|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[redacted]');
  };
  const executablePath = process.env.QA_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
  await access(executablePath).catch(() => { throw new Error('Cached Chromium is missing; install it separately. QA never downloads browsers.'); });
  const { problems, actions, findings, coverage, sequence: previousSequence } = await evidenceHistory(directory);
  const browser = await chromium.launch({ executablePath, headless: true });
  let context, server, stopping;
  let sequence = previousSequence;
  const stop = () => stopping ??= (async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    if (context) {
      const tracePath = join(directory, `trace-${randomBytes(8).toString('hex')}.zip`);
      await context.tracing.stop({ path: tracePath }).catch(() => {});
      await chmod(tracePath, 0o600).catch(() => {});
      await context.close().catch(() => {});
    }
    await browser.close();
  })();
  try {
    context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false,
      viewport: { width: role === 'a' ? 390 : 320, height: 844 } });
    context.setDefaultTimeout(15000);
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      const mapsRequest = process.env.QA_MAPS_ENABLED === 'true' && u.protocol === 'https:' && (!u.port || u.port === '443') && mapsHosts.has(u.hostname);
      return (allowed.has(u.origin) || mapsRequest) && !u.username && !u.password ? route.continue() : route.abort('blockedbyclient');
    });
    if (!context.routeWebSocket) throw new Error('Playwright with routeWebSocket support is required');
    await context.routeWebSocket('**/*', socket => {
      const u = new URL(socket.url());
      if (allowed.has(u.origin.replace('ws:', 'http:'))) socket.connectToServer(); else socket.close();
    });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    const page = await context.newPage();
    context.on('page', popup => { if (popup !== page) void popup.close(); });
    page.on('console', message => { if (message.type() === 'error') problems.push(scrub(message.text())); });
    page.on('pageerror', error => problems.push(scrub(error.message)));
    page.on('requestfailed', request => problems.push(scrub(`${request.method()} ${request.url()} ${request.failure()?.errorText}`)));
    page.on('response', response => { if (response.status() >= 400) problems.push(scrub(`${response.status()} ${response.url()}`)); });
    const target = t => {
      if (!t || typeof t !== 'object') throw new Error('Target required');
      if (t.role) return page.getByRole(t.role, { name: t.name, exact: t.exact ?? true });
      if (t.label) return page.getByLabel(t.label, { exact: t.exact ?? true });
      if (t.selector) return page.locator(t.selector);
      if (t.text) return page.getByText(t.text, { exact: t.exact ?? true });
      throw new Error('Invalid target');
    };
    const appURL = path => {
      const u = new URL(path, web);
      if (u.origin !== web || u.username || u.password) throw new Error('Only app navigation is allowed');
      return u.href;
    };
    const checkpoint = async () => {
      await page.waitForLoadState('domcontentloaded');
      const path = join(directory, `checkpoint-${String(++sequence).padStart(4, '0')}.png`);
      await page.screenshot({ path, fullPage: true, mask: [page.locator('input[type=password]')] });
      await chmod(path, 0o600);
      const ariaSnapshot = scrub(await page.locator('body').ariaSnapshot());
      return { ariaSnapshot, sanitizedURL: scrub(page.url()), screenshot: path, problems: problems.slice(-50) };
    };
    const verificationURL = raw => {
      const u = new URL(raw.replaceAll('&amp;', '&'));
      if (u.username || u.password) throw new Error('Invalid confirmation link');
      if (u.origin === auth && u.pathname === '/auth/v1/verify') {
        const redirect = u.searchParams.get('redirect_to');
        if (redirect && new URL(redirect).origin !== web) throw new Error('Nonlocal confirmation redirect');
        return u.href;
      }
      if (u.origin === web && /^\/auth\/callback\/?$/.test(u.pathname)) return u.href;
      throw new Error('Not an isolated confirmation link');
    };
    const email = async () => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        const response = await fetch(`${mail}/api/v1/search?query=${encodeURIComponent(`to:${actor.email}`)}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
        if (!response.ok) throw new Error(`Mailpit search failed (${response.status})`);
        const listing = await response.json();
        for (const item of listing.messages ?? []) {
          if (!(item.To ?? []).some(recipient => recipient.Address?.toLowerCase() === actor.email.toLowerCase())) continue;
          const detail = await fetch(`${mail}/api/v1/message/${encodeURIComponent(item.ID)}`, { signal: AbortSignal.timeout(5000), redirect: 'error' });
          if (!detail.ok) throw new Error('Mailpit message read failed');
          const message = await detail.json();
          if (!(message.To ?? []).some(recipient => recipient.Address?.toLowerCase() === actor.email.toLowerCase())) continue;
          const links = `${message.HTML ?? ''}\n${message.Text ?? ''}`.match(/https?:\/\/[^\s<>"']+/g) ?? [];
          for (const link of links) {
            let validated;
            try { validated = verificationURL(link); } catch { continue; }
            await page.goto(validated, { waitUntil: 'domcontentloaded' });
            return { confirmed: true, ...await checkpoint() };
          }
        }
        await delay(500); // Bounded inbox polling, not a DOM-state sleep.
      }
      throw new Error('No actor-specific verification email within 90 seconds');
    };
    const execute = async input => {
      const { method } = input;
      switch (method) {
        case 'persona': {
          const actors = await readJson(join(run.directory, 'actors.json'));
          const peer = actors[role === 'a' ? 'b' : 'a'];
          return { role, name: actor.name, username: actor.username, birthdate: actor.birthdate,
            peer: { name: peer.name, username: peer.username }, email: actor.email };
        }
        case 'peers': {
          const peerRole = role === 'a' ? 'b' : 'a';
          let progress = [];
          const peer = (await readJson(join(run.directory, 'actors.json')))[peerRole];
          try { progress = await readJson(join(await actorDirectory(run, peerRole, peer), 'coverage.json')); }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
          return { peer: peerRole, progress: progress.slice(-20) };
        }
        case 'look': case 'screenshot': return checkpoint();
        case 'goto': await page.goto(appURL(input.path ?? input.url), { waitUntil: 'domcontentloaded' }); break;
        case 'fill': {
          const locator = target(input.target);
          if (await locator.getAttribute('type') === 'password') filledValues.add(String(input.value));
          await locator.fill(String(input.value)); break;
        }
        case 'credential': {
          if (!['email', 'password', 'confirm'].includes(input.field)) throw new Error('Invalid credential field');
          await target(input.target).fill(input.field === 'email' ? actor.email : actor.password); break;
        }
        case 'click': await target(input.target).click(); break;
        case 'check': await target(input.target).setChecked(input.checked ?? true); break;
        case 'select': await target(input.target).selectOption(input.value); break;
        case 'upload': {
          if (input.file !== 'avatar.png') throw new Error('Only the run-owned avatar.png fixture may be uploaded.');
          await target(input.target).setInputFiles(join(run.directory, 'fixtures', input.file)); break;
        }
        case 'key': if (input.target) await target(input.target).press(input.key); else await page.keyboard.press(input.key); break;
        case 'scroll': await page.mouse.wheel(Number(input.x ?? 0), Number(input.y ?? 600)); break;
        case 'viewport': {
          if (![input.width, input.height].every(n => Number.isInteger(n) && n >= 240 && n <= 2560)) throw new Error('Invalid viewport');
          await page.setViewportSize({ width: input.width, height: input.height }); break;
        }
        case 'wait': {
          const timeout = Math.min(Math.max(Number(input.timeout) || 15000, 1), 60000);
          if (input.url) await page.waitForURL(appURL(input.url), { timeout });
          else await target(input.target).waitFor({ state: input.state ?? 'visible', timeout });
          break;
        }
        case 'assert-value': {
          const actual = await target(input.target).inputValue();
          if (actual !== String(input.value)) throw new Error('UI input value did not match the expected saved value.');
          break;
        }
        case 'email': return email();
        case 'finding': findings.push(JSON.parse(scrub(JSON.stringify(input.finding)))); await privateJson(join(directory, 'findings.json'), findings); break;
        case 'coverage': coverage.push(JSON.parse(scrub(JSON.stringify(input.coverage)))); await privateJson(join(directory, 'coverage.json'), coverage); break;
        case 'finish': setImmediate(() => void stop()); return { finished: true };
        default: throw new Error('Unsupported action');
      }
      return { ok: true, sanitizedURL: scrub(page.url()) };
    };
    const token = randomBytes(32).toString('hex');
    let busy = false;
    server = createServer(async (request, response) => {
      const reply = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); };
      const supplied = Buffer.from(request.headers.authorization ?? '');
      const expected = Buffer.from(`Bearer ${token}`);
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reply(401, { error: 'Unauthorized' });
      if (request.headers.host !== `127.0.0.1:${run.ports[role === 'a' ? 'agentA' : 'agentB']}`
        || request.headers.origin || request.headers['content-type'] !== 'application/json') return reply(403, { error: 'Local JSON controller requests only' });
      if (request.method !== 'POST' || request.url !== '/action') return reply(404, { error: 'Not found' });
      if (busy || stopping) return reply(409, { error: 'Actor is busy or stopping' });
      busy = true;
      let input;
      try {
        let size = 0; const chunks = [];
        for await (const chunk of request) { size += chunk.length; if (size > 32768) throw new Error('Action exceeds 32KB'); chunks.push(chunk); }
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (actions.length >= 300 && !['finding', 'coverage', 'finish'].includes(input.method)) return reply(429, { error: 'This actor reached the 300-action safety budget. Record uncovered features in the report; start a new run for more testing.' });
        const result = await execute(input);
        actions.push({ at: new Date().toISOString(), method: input.method, target: input.target ? JSON.parse(scrub(JSON.stringify(input.target))) : undefined,
          value: input.method === 'fill' ? scrub(input.value) : undefined, path: input.path ? scrub(input.path) : undefined,
          key: input.key, file: input.file, field: input.field, ok: true });
        await privateJson(join(directory, 'actions.json'), actions);
        await privateJson(join(directory, 'problems.json'), problems);
        reply(200, result);
      } catch (error) {
        const message = scrub(error.message);
        // Never log action arguments: fill and key may carry a secret.
        actions.push({ at: new Date().toISOString(), method: typeof input?.method === 'string' ? scrub(input.method) : 'invalid', ok: false, error: message });
        await privateJson(join(directory, 'actions.json'), actions);
        reply(400, { error: message });
      } finally { busy = false; }
    });
    server.requestTimeout = 120000;
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(run.ports[role === 'a' ? 'agentA' : 'agentB'], '127.0.0.1', resolve); });
    await privateJson(join(run.directory, 'control', `${role}.json`), { port: run.ports[role === 'a' ? 'agentA' : 'agentB'], token });
    return stop;
  } catch (error) { await stop(); throw error; }
}
