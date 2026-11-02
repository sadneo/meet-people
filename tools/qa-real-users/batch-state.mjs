import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { readJson, validateUiUsers } from './state.mjs';

export const requiredBatchStages = ['registration', 'email-confirmation', 'password-login', 'onboarding-about', 'onboarding-interests',
  'onboarding-intentions', 'onboarding-week', 'enter-app', 'profile-edit-save-reload', 'logout'];

export function userDirectory(run, ordinal) {
  const uiUsers = validateUiUsers(run.count, run.uiUsers);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > uiUsers) throw new Error('Invalid planned user ordinal.');
  return join(run.directory, 'agents', `user-${String(ordinal).padStart(3, '0')}`);
}

export function pairOrdinals(run, pair) {
  const uiUsers = validateUiUsers(run.count, run.uiUsers);
  if (!Number.isInteger(pair) || pair < 1 || pair > uiUsers / 2) throw new Error('Invalid pair index.');
  return [pair * 2 - 1, pair * 2];
}

export function plannedIdentity(run, ordinal) {
  userDirectory(run, ordinal);
  const firstNames = ['Avery', 'Blair', 'Casey', 'Devon', 'Ellis', 'Finley', 'Gray', 'Harper', 'Indigo', 'Jules'];
  return { ordinal, role: ordinal % 2 ? 'a' : 'b', email: `qa-ui-${ordinal}-${run.id}@example.test`,
    name: `QA ${firstNames[(ordinal - 1) % firstNames.length]} ${ordinal}`,
    username: `qa_u${ordinal}_${run.id.slice(-8)}`, birthdate: `${1988 + (ordinal - 1) % 16}-01-01`,
    interests: ['Coffee', 'Art', 'Music'] };
}

export function createPlan(run) {
  return { version: 1, runId: run.id, users: Array.from({ length: run.uiUsers }, (_, i) => ({
    ...plannedIdentity(run, i + 1), password: randomBytes(24).toString('base64url') + '-Aa1!',
  })) };
}

export function validatePlan(run, plan) {
  if (plan?.version !== 1 || plan.runId !== run.id || !Array.isArray(plan.users) || plan.users.length !== run.uiUsers) throw new Error('Invalid private batch plan.');
  for (const [i, actor] of plan.users.entries()) {
    const { password, ...identity } = actor;
    if (JSON.stringify(identity) !== JSON.stringify(plannedIdentity(run, i + 1)) || typeof password !== 'string' || !/^[A-Za-z0-9_-]{32}-Aa1!$/.test(password)) throw new Error('Invalid planned actor identity.');
  }
  return plan;
}

export async function pairActors(run, pair) {
  const plan = validatePlan(run, await readJson(join(run.directory, 'batch-plan.json')));
  return Object.fromEntries(pairOrdinals(run, pair).map(ordinal => {
    const actor = plan.users[ordinal - 1];
    return [actor.role, actor];
  }));
}

export async function actorDirectory(run, role, actor) {
  if (!['a', 'b'].includes(role)) throw new Error('Unknown actor.');
  if ((run.uiUsers ?? 2) <= 2) return join(run.directory, 'agents', role);
  const plan = validatePlan(run, await readJson(join(run.directory, 'batch-plan.json')));
  const expected = plan.users[actor.ordinal - 1];
  if (!expected || expected.role !== role || JSON.stringify(expected) !== JSON.stringify(actor)) throw new Error('Actor does not match the fixed private batch plan.');
  return userDirectory(run, expected.ordinal);
}

export function initialBatch(run) {
  return { version: 1, runId: run.id, coverage: 'scripted signup, email confirmation, password login, onboarding, profile edit/save/reload and logout; discovery and autonomous exploration NOT covered',
    pairs: Array.from({ length: run.uiUsers / 2 }, (_, index) => ({ pair: index + 1, status: 'pending',
      users: pairOrdinals(run, index + 1).map(ordinal => ({ ordinal, status: 'pending', stages: [] })) })) };
}

export function nextPair(run, state, resume = false) {
  if (state?.version !== 1 || state.runId !== run.id || !Array.isArray(state.pairs) || state.pairs.length !== run.uiUsers / 2) throw new Error('Invalid batch progress.');
  let pending = false, completed = 0;
  for (const [index, pair] of state.pairs.entries()) {
    const ordinals = pairOrdinals(run, index + 1);
    if (pair.pair !== index + 1 || !Array.isArray(pair.users) || pair.users.length !== 2
      || pair.users.some((user, i) => user.ordinal !== ordinals[i] || !Array.isArray(user.stages))) throw new Error('Invalid pair progress.');
    if (!['pending', 'passed'].includes(pair.status)) throw new Error(`Pair ${pair.pair} is ${pair.status}: ambiguous/failed actors must not be re-registered. Preserve evidence and investigate; use a new run for fresh registration.`);
    if (pair.status === 'passed') {
      if (pending || pair.users.some(user => user.status !== 'passed' || JSON.stringify(user.stages) !== JSON.stringify(requiredBatchStages))) throw new Error('Noncontiguous or incomplete completed pairs.');
      completed++;
    } else {
      pending = true;
      if (pair.users.some(user => user.status !== 'pending' || user.stages.length)) throw new Error('Pending pair has partial user progress; refusing replay.');
    }
  }
  if (completed && !resume) throw new Error('Completed pairs exist. Use --resume to explicitly continue only untouched pairs.');
  return completed === state.pairs.length ? null : completed + 1;
}
