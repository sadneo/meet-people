import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import console from 'node:console'

export function resolveDeployment(env, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  const manual = env.GITHUB_EVENT_NAME === 'workflow_dispatch'
  assert.ok(manual || env.GITHUB_EVENT_NAME === 'push', 'Unsupported deployment event')
  assert.ok(['refs/heads/main', 'refs/heads/dev'].includes(env.GITHUB_REF), 'Deployments must use the workflow on main or dev')
  const environment = manual ? env.DEPLOY_ENVIRONMENT : env.GITHUB_REF === 'refs/heads/main' ? 'production' : 'sandbox'
  assert.ok(['production', 'sandbox'].includes(environment), 'Choose production or sandbox')
  if (environment === 'production') assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Production must use the workflow on main')
  const skip = manual && env.SKIP_CHECKS === 'true'
  if (skip) assert.ok(env.OVERRIDE_REASON?.trim(), 'Skipping checks requires an override reason')
  const branch = environment === 'production' ? 'main' : 'dev'
  let sha = env.GITHUB_SHA
  if (manual && environment === 'sandbox') {
    const source = env.SOURCE_REF?.trim()
    sha = !source || source === branch ? git(['rev-parse', '--verify', `refs/remotes/origin/${branch}^{commit}`]) : source
  } else if (manual) {
    sha = env.SOURCE_REF?.trim()
  }
  assert.match(sha ?? '', /^[0-9a-f]{40}$/, `Deployment source must be a full commit SHA on ${branch}`)
  git(['merge-base', '--is-ancestor', sha, `refs/remotes/origin/${branch}`])
  return { sha, branch, environment, skip_checks: String(skip) }
}

export function assertCurrentDeployment(env, git = args => execFileSync('git', args, { encoding: 'utf8' }).trim()) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.DEPLOY_ENVIRONMENT !== 'sandbox') return
  const head = git(['ls-remote', '--exit-code', 'origin', 'refs/heads/dev']).split(/\s/)[0]
  assert.equal(env.RELEASE_SHA, head, 'Superseded sandbox release: a newer dev commit exists; no deployment changes were made')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check-current')) {
    assertCurrentDeployment(process.env)
  } else {
    const result = resolveDeployment(process.env)
    appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''))
    console.info(`Deploying ${result.branch}@${result.sha} to ${result.environment}; checks skipped: ${result.skip_checks}`)
  }
}
