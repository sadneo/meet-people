// Exercise the real deployment script without cloud access.
// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it('deploys a paused or enabled worker without executing it or retrying tasks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pebble-worker-'))
  try {
    writeFileSync(join(directory, 'gcloud'), '#!/bin/sh\nprintf "%s\\n" "$@"\n', { mode: 0o700 })
    const env = { ...process.env, PATH: `${directory}:${process.env.PATH}`, GCP_PROJECT_ID: 'test-project', API_IMAGE: 'image@sha256:test', SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-test' }
    for (const enabled of ['', 'true', 'false']) {
      const result = spawnSync('sh', ['scripts/deploy-worker.sh'], { env: { ...env, EVENT_GROUP_WORKER_ENABLED: enabled }, encoding: 'utf8' })
      expect(result.status).toBe(0)
      const args = result.stdout.trim().split('\n')
      expect(args.slice(0, 4)).toEqual(['run', 'jobs', 'deploy', 'pebble-event-group-worker'])
      expect(args).toContain('--max-retries=0')
      expect(args).toContain('--args=dist/api/api/event-group-worker-main.js')
      expect(args).not.toContain('--execute-now')
      expect(args).toContain(enabled === 'true' ? '--set-secrets=EVENT_GROUP_WORKER_JWT=pebble-event-group-worker-jwt:latest' : '--clear-secrets')
      expect(args.find(arg => arg.startsWith('--set-env-vars='))).toContain(`MATCHMAKING_SCORING_ENABLED=${enabled === 'true'}`)
    }
    expect(spawnSync('sh', ['scripts/deploy-worker.sh'], { env: { ...env, EVENT_GROUP_WORKER_ENABLED: 'typo' } }).status).not.toBe(0)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
