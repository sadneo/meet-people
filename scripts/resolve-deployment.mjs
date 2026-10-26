import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'

export function resolveDeployment(env, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  const manual = env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  assert.ok(manual || env.GITHUB_EVENT_NAME === 'push', 'Unsupported deployment event')
  assert.ok(['refs/heads/main', 'refs/heads/dev'].includes(env.GITHUB_REF), 'Run the deployment workflow from main or dev')
  if (manual) assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Manual deployments must use the workflow on main')
  const environment = manual ? env.DEPLOY_ENVIRONMENT : env.GITHUB_REF === 'refs/heads/main' ? 'production' : 'sandbox'
  assert.ok(['production', 'sandbox'].includes(environment), 'Choose production or sandbox')
  const skip = manual && env.SKIP_CHECKS === 'true'
  if (skip) assert.ok(env.OVERRIDE_REASON?.trim(), 'Skipping checks requires an override reason')
  let branch = environment === 'production' ? 'main' : 'dev'
  let sha = env.GITHUB_SHA
  if (manual && environment === 'sandbox') {
    branch = env.SOURCE_REF?.trim() || 'dev'
    git(['check-ref-format', `refs/heads/${branch}`])
    sha = git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`])
  } else if (manual) {
    sha = env.SOURCE_REF?.trim()
  }
  assert.match(sha ?? '', /^[0-9a-f]{40}$/, 'Production manual deployments require a full commit SHA')
  if (environment === 'production') git(['merge-base', '--is-ancestor', sha, 'refs/remotes/origin/main'])
  return { sha, branch, environment, skip_checks: String(skip) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = resolveDeployment(process.env)
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''))
  console.info(`Deploying ${result.branch}@${result.sha} to ${result.environment}; checks skipped: ${result.skip_checks}`)
}
