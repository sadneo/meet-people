// @vitest-environment node
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { build } from 'vite'
import { expect, it, vi } from 'vitest'
import { mobileEntry } from '../../vite.mobile.config'

it.each(['web', 'mobile'])('removes quick-login UI and anonymous Auth call sites from the %s production bundle', async product => {
  vi.stubEnv('NODE_ENV', 'production')
  try {
    const result = await build({
      root: fileURLToPath(new URL('../..', import.meta.url)),
      configFile: false,
      envDir: false,
      mode: 'production',
      plugins: [react(), ...(product === 'mobile' ? [mobileEntry] : [])],
      logLevel: 'error',
      build: { outDir: 'dist/web', write: false },
    })
    const outputs = Array.isArray(result) ? result : [result]
    const chunks = outputs.flatMap(output => 'output' in output ? output.output : [])
      .filter(output => output.type === 'chunk')
    expect(chunks.length).toBeGreaterThan(0)
    const javascript = chunks.map(chunk => chunk.code).join('\n')
    if (product === 'web') {
      expect(javascript).not.toContain('Continue with email')
      expect(javascript).not.toContain('Join group queue')
    } else {
      expect(javascript).toContain('Continue with email')
      expect(javascript).toContain('Join group queue')
    }
    expect(javascript).not.toContain('Quick sign in (local only)')
    expect(javascript).not.toContain('Sign in as development user')
    expect(javascript).not.toContain('/__dev/login')
    expect(javascript).not.toContain('Local development only:')
    expect(javascript).not.toContain('disposable local development session')
    expect(javascript).not.toContain('Could not complete local quick sign-in')
    expect(javascript).not.toMatch(/\.auth\.signInAnonymously\s*\(/)
    // The genuine SDK remains intact; only the application quick-login path is removed.
    expect(javascript).toContain('signInAnonymously')
  } finally {
    vi.unstubAllEnvs()
  }
}, 30_000)
