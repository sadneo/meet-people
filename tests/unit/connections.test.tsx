import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConnectButton } from '../../src/features/connections/ConnectButton'

vi.mock('../../src/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'real-session' } } }) } } }))
const taylor = 'a0000000-0000-4000-8000-000000000002'
const chat = 'c0000000-0000-4000-8000-000000000001'
type Status = 'none' | 'sent' | 'incoming' | 'connected'
let status: Status = 'none'
let failure: { status: number; error: string } | null = null
const json = (data: unknown, code = 200) => new Response(JSON.stringify(data), { status: code, headers: { 'Content-Type': 'application/json' } })
const state = () => ({ status, conversationId: status === 'connected' ? chat : null })
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = String(input), method = init?.method ?? 'GET'
  if (failure && method !== 'GET') return json({ error: failure.error }, failure.status)
  if (method === 'DELETE') status = 'none'
  else if (path.endsWith('/accept')) status = 'connected'
  else if (method === 'POST') status = status === 'incoming' ? 'connected' : 'sent'
  return json(state())
})
beforeEach(() => { status = 'none'; failure = null; vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
const mount = () => render(<MemoryRouter><ConnectButton userId={taylor} name="Taylor" /></MemoryRouter>)
const calls = () => fetchMock.mock.calls.map(([input, init]) => `${init?.method ?? 'GET'} ${String(input)}`)

describe('connect button', () => {
  it('sends and cancels a request for this person only', async () => {
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))
    await screen.findByText('Request sent')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    await screen.findByRole('button', { name: 'Connect' })
    expect(calls()).toEqual([`GET /api/connections/${taylor}`, `POST /api/connections/${taylor}`, `DELETE /api/connections/${taylor}`])
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer real-session' })
  })
  it('accepts an incoming request and then offers the direct chat', async () => {
    status = 'incoming'
    mount()
    await screen.findByText('Taylor wants to connect')
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
    const message = await screen.findByRole('link', { name: 'Message' })
    expect(message.getAttribute('href')).toBe(`/messages/chat?conversation=${chat}`)
    expect(calls()).toContain(`POST /api/connections/${taylor}/accept`)
  })
  it('offers Message once the other person accepts my request', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    status = 'sent'
    mount()
    await screen.findByText('Request sent')
    status = 'connected'
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect((await screen.findByRole('link', { name: 'Message' })).getAttribute('href')).toBe(`/messages/chat?conversation=${chat}`)
    expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull()
  })
  it('does not check for an answer when no request is waiting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mount()
    await screen.findByRole('button', { name: 'Connect' })
    await act(() => vi.advanceTimersByTimeAsync(15000))
    expect(calls()).toEqual([`GET /api/connections/${taylor}`])
  })
  it('declines an incoming request', async () => {
    status = 'incoming'
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }))
    await screen.findByRole('button', { name: 'Connect' })
    expect(calls()).toContain(`DELETE /api/connections/${taylor}`)
  })
  it('shows the server’s reason and keeps the current state when a request fails', async () => {
    failure = { status: 429, error: 'You’ve sent a lot of requests today. Try again tomorrow.' }
    mount()
    const connect = await screen.findByRole('button', { name: 'Connect' })
    await waitFor(() => expect(connect.hasAttribute('disabled')).toBe(false))
    fireEvent.click(connect)
    expect((await screen.findByRole('alert')).textContent).toBe('You’ve sent a lot of requests today. Try again tomorrow.')
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
  })
  it('sends requests to the hosted API in the Android build', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://pebble.example/')
    mount()
    await screen.findByRole('button', { name: 'Connect' })
    expect(calls()).toEqual([`GET https://pebble.example/api/connections/${taylor}`])
  })
  it('disables Connect until the current state is known', () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}))
    mount()
    expect(screen.getByRole('button', { name: 'Connect' }).hasAttribute('disabled')).toBe(true)
  })
})
