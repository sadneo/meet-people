import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import DevelopmentNavigator from '../../src/ui/DevelopmentNavigator'

beforeEach(() => { vi.stubEnv('DEV', false); vi.stubEnv('VITE_DEV_TOOLS', 'false') })
afterEach(() => { cleanup(); vi.unstubAllEnvs() })

it('keeps the navigator hidden in the normal production variant', () => {
  render(<MemoryRouter><DevelopmentNavigator /></MemoryRouter>)
  expect(screen.queryByRole('complementary', { name: 'Development navigation' })).toBeNull()
})

it('shows the explicitly enabled developer variant with its build identity', () => {
  vi.stubEnv('VITE_DEV_TOOLS', 'true')
  vi.stubEnv('VITE_BUILD_BRANCH', 'wiring')
  vi.stubEnv('VITE_BUILD_SHA', 'ab05a54ac7b0d9e681bb765ad7c6a6ba22a8b648')
  render(<MemoryRouter><DevelopmentNavigator /></MemoryRouter>)
  expect(screen.getByRole('complementary', { name: 'Development navigation' })).toBeTruthy()
  expect(screen.getByText('wiring · ab05a54 · Changes may be saved')).toBeTruthy()
})
