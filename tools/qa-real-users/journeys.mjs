import { join } from 'node:path';
import { readJson, privateJson } from './state.mjs';

// Only browser-controller HTTP calls are used: no SDK, account repair, or seeded session.
export async function smoke(run, { outputPath = join(run.directory, 'smoke-results.json'), profilePersistence = false, logout = false, stopOnFailure = false, onProgress = async () => {} } = {}) {
  const actors = await readJson(join(run.directory, 'actors.json'));
  const results = [];
  for (const role of ['a', 'b']) {
    const control = await readJson(join(run.directory, 'control', `${role}.json`));
    const result = { role, ordinal: actors[role].ordinal, status: 'running', stages: [], checkpoints: [] };
    results.push(result);
    await onProgress(result);
    const action = async (method, args = {}) => {
      const response = await fetch(`http://127.0.0.1:${control.port}/action`, {
        method: 'POST', headers: { Authorization: `Bearer ${control.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, ...args }), signal: AbortSignal.timeout(115000), redirect: 'error',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Controller returned ${response.status}`);
      return body;
    };
    const button = name => ({ role: 'button', name });
    const click = name => action('click', { target: button(name) });
    const fill = (label, value) => action('fill', { target: { label }, value });
    const wait = target => action('wait', { target, timeout: 45000 });
    const checkpoint = async stage => {
      const view = await action('look');
      result.stages.push(stage);
      result.checkpoints.push({ stage, ...view });
      await action('coverage', { coverage: { journey: 'fresh-user-smoke', stage, status: 'passed', screenshot: view.screenshot } });
      await privateJson(outputPath, results);
      await onProgress(result);
    };
    let stage = 'registration';
    try {
      await action('goto', { path: '/login' });
      await action('credential', { field: 'email', target: { label: 'Email' } });
      await click('Continue with email');
      await wait(button('Create account'));
      for (const [field, label] of [['password', 'Password'], ['confirm', 'Confirm password']]) {
        await action('credential', { field, target: { label } });
      }
      await click('Create account');
      await wait({ text: 'Check your email to verify your account, then sign in.' });
      await checkpoint(stage);
      stage = 'email-confirmation';
      await action('email');
      await wait(button('Start my profile'));
      // Confirmation may establish a session. Explicit logout proves password login separately.
      await action('goto', { path: '/logout' });
      await click('Sign out');
      await wait({ role: 'heading', name: 'Welcome to Pebble' });
      await checkpoint(stage);
      stage = 'password-login';
      await action('credential', { field: 'email', target: { label: 'Email' } });
      await click('Continue with email');
      await action('credential', { field: 'password', target: { label: 'Password' } });
      await click('Sign in');
      await wait(button('Start my profile'));
      await checkpoint(stage);
      stage = 'onboarding-about';
      await click('Start my profile');
      await fill('Display name', actors[role].name);
      await fill('Username', actors[role].username);
      await fill('Birthdate · private', actors[role].birthdate);
      await fill('City or campus area', 'Stony Brook');
      await click('Save & continue');
      await wait({ role: 'heading', name: 'Your kind of things.' });
      await checkpoint(stage);
      stage = 'onboarding-interests';
      for (const name of actors[role].interests ?? ['Coffee', 'Art', 'Music']) await click(name);
      await click('Save & continue');
      await wait({ role: 'heading', name: 'What brings you here?' });
      await checkpoint(stage);
      stage = 'onboarding-intentions';
      await action('check', { target: { role: 'checkbox', name: 'Make friends' } });
      await click('Save & continue');
      await wait({ role: 'heading', name: 'Make room for a hello.' });
      await checkpoint(stage);
      stage = 'onboarding-week';
      await action('select', { target: { role: 'combobox', name: 'Comfortable distance' }, value: 'Nearby' });
      await action('select', { target: { role: 'combobox', name: 'Group preference' }, value: 'Either' });
      await click('Add a time window');
      await action('select', { target: { role: 'combobox', name: 'Day' }, value: '1' });
      await fill('From', '17:00');
      await fill('Until', '19:00');
      await action('select', { target: { role: 'combobox', name: 'Timezone' }, value: 'America/New_York' });
      await wait({ text: 'Timezone and sharing preference saved.' });
      await click('Finish setup');
      await wait({ role: 'heading', name: 'Your Pebble is ready.' });
      await checkpoint(stage);
      stage = 'enter-app';
      await action('click', { target: { role: 'link', name: 'Enter Pebble' } });
      await action('wait', { target: { selector: '.onboarding-journey' }, state: 'hidden', timeout: 45000 });
      await checkpoint(stage);
      if (profilePersistence) {
        stage = 'profile-edit-save-reload';
        const editedName = `${actors[role].name} Edited`;
        await action('goto', { path: '/profile' });
        await click('Edit profile');
        await fill('Display name', editedName);
        await click('Save changes');
        await wait({ role: 'heading', name: 'Profile' });
        // Full document navigation reloads server-backed account state, not the draft.
        await action('goto', { path: '/profile' });
        await wait({ role: 'heading', name: editedName });
        await click('Edit profile');
        await action('assert-value', { target: { label: 'Display name' }, value: editedName });
        await checkpoint(stage);
        await click('Cancel');
      }
      if (logout) {
        stage = 'logout';
        await action('goto', { path: '/logout' });
        await click('Sign out');
        await wait({ role: 'heading', name: 'Welcome to Pebble' });
        await checkpoint(stage);
      }
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.failedStage = stage;
      result.error = error.message;
      // Preserve evidence without trying to repair or bypass the failed UI.
      try {
        const view = await action('look');
        result.checkpoints.push({ stage: `${stage}-failure`, ...view });
        await action('finding', { finding: { severity: null, status: 'Needs reproduction', title: `Fresh actor ${role}: ${stage} blocked`, observed: result.error,
          screenshot: view.screenshot, reproduction: `Run fresh-user smoke; stages passed: ${result.stages.join(', ')}`, confirmedRuns: 1 } });
      } catch (evidenceError) { result.evidenceError = evidenceError.message; }
      if (logout) {
        try {
          await action('goto', { path: '/logout' });
          await click('Sign out');
          await wait({ role: 'heading', name: 'Welcome to Pebble' });
        } catch (logoutError) { result.logoutError = logoutError.message; }
      }
    }
    await privateJson(outputPath, results);
    await onProgress(result);
    if (stopOnFailure && result.status !== 'passed') break;
  }
  // Browsers/services intentionally remain alive for manual QA and explicit lifecycle stop.
  return { ok: results.every(result => result.status === 'passed'), results };
}
