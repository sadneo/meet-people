import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { Auth } from '../../src/ui/Auth'

vi.mock('../../src/supabase', () => ({ supabase: { auth: {} } }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it.each([503, 429, 'network', 'invalid'] as const)('shows safe actionable email lookup errors for %s and allows retry', async failure => {
  const fetcher = vi.fn().mockImplementationOnce(async () => {
    if (failure === 'network') throw new Error('Failed fetch https://private.example/api/auth/email')
    return new Response(failure === 'invalid' ? '<html>Proxy error</html>' : '{"error":"internal secret"}', { status: failure === 'invalid' ? 200 : failure })
  }).mockResolvedValue(new Response('{"exists":true}'))
  vi.stubGlobal('fetch', fetcher)
  render(<MemoryRouter><Auth /></MemoryRouter>)
  fireEvent.change(screen.getByRole('textbox', { name: /email/i }), { target: { value: 'qa@example.test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  const alert = await screen.findByRole('alert')
  expect(alert.textContent).toMatch(/try again/i)
  expect(alert.textContent).not.toMatch(/https?:|internal secret|JSON|HTTP|Proxy|Failed fetch/)
  fireEvent.click(screen.getByRole('button', { name: 'Continue with email' }))
  await waitFor(() => expect(screen.getByLabelText('Password')).toBeTruthy())
})
