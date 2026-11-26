import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { z } from 'zod'
import { ApiRequestError, authorizedRequest } from '../auth/authorizedRequest'
import { useSession } from '../auth/useSession'
import { apiUrl } from '../platform/native'
import { supabase } from '../supabase'
import './dashboard.css'

const Count = z.number().int().nonnegative()
const SummarySchema = z.object({
  generatedAt: z.string(),
  totalUsers: Count, onlineNow: Count, activeToday: Count, active7d: Count, active30d: Count,
  minutesTotal: Count, profileOpensTotal: Count, messagesTotal: Count, messages24h: Count, messages7d: Count,
  series: z.array(z.object({ day: z.string(), activeUsers: Count, minutes: Count, profileOpens: Count })),
})
const UserSchema = z.object({
  id: z.string(), username: z.string(), displayName: z.string(), avatarUrl: z.string().nullable(),
  joinedAt: z.string(), lastSeen: z.string().nullable(), online: z.boolean(),
  minutesUsed: Count, daysActive: Count, profileOpens: Count, messagesSent: Count, messagesReceived: Count,
  hasUploadedPhoto: z.boolean(),
})
const UsersSchema = z.object({ users: z.array(UserSchema) })
type Summary = z.infer<typeof SummarySchema>
type User = z.infer<typeof UserSchema>

const number = new Intl.NumberFormat('en-US')
function duration(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}
function ago(iso: string | null) {
  if (!iso) return 'Never'
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (seconds < 90) return 'Just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`
  return `${Math.round(seconds / 86400)}d ago`
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return <div className="dash-stat"><span>{label}</span><strong>{number.format(value)}</strong>{note && <small>{note}</small>}</div>
}

function Bars({ series, pick, label }: { series: Summary['series']; pick: (day: Summary['series'][number]) => number; label: string }) {
  const max = Math.max(1, ...series.map(pick))
  const width = 600, height = 120, gap = 4, bar = (width - gap * (series.length - 1)) / Math.max(1, series.length)
  return <figure className="dash-chart">
    <figcaption>{label}</figcaption>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}, last ${series.length} days`} preserveAspectRatio="none">
      {series.map((day, index) => {
        const h = Math.max(pick(day) > 0 ? 3 : 1, (pick(day) / max) * (height - 4))
        return <rect key={day.day} x={index * (bar + gap)} y={height - h} width={bar} height={h} rx="2"><title>{`${day.day}: ${number.format(pick(day))}`}</title></rect>
      })}
    </svg>
    <div className="dash-chart-axis"><span>{series[0]?.day.slice(5)}</span><span>peak {number.format(max)}</span><span>{series.at(-1)?.day.slice(5)}</span></div>
  </figure>
}

function Avatar({ user, token }: { user: User; token: string }) {
  const [blob, setBlob] = useState<string | null>(null)
  useEffect(() => {
    if (!user.hasUploadedPhoto) return
    let url: string | null = null
    const controller = new AbortController()
    fetch(apiUrl(`/api/usage/admin/photo/${user.id}`), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(response => response.ok ? response.blob() : null)
      .then(file => { if (file) { url = URL.createObjectURL(file); setBlob(url) } })
      .catch(() => undefined)
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [user.id, user.hasUploadedPhoto, token])
  const src = blob ?? user.avatarUrl
  const initials = user.displayName.trim().slice(0, 1).toUpperCase() || '?'
  return <span className="dash-avatar">{src ? <img src={src} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span aria-hidden="true">{initials}</span>}{user.online && <i title="Online now" />}</span>
}

type SortKey = 'lastSeen' | 'displayName' | 'minutesUsed' | 'daysActive' | 'messagesSent' | 'messagesReceived' | 'profileOpens'
const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'displayName', label: 'Person' }, { key: 'lastSeen', label: 'Last seen' },
  { key: 'minutesUsed', label: 'Time used', numeric: true }, { key: 'daysActive', label: 'Days active', numeric: true },
  { key: 'messagesSent', label: 'Sent', numeric: true }, { key: 'messagesReceived', label: 'Received', numeric: true },
  { key: 'profileOpens', label: 'Profile opens', numeric: true },
]

function AdminSignIn() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true); setError('')
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) setError('Those details did not work.')
    setBusy(false)
  }
  return <form className="dash-signin" onSubmit={submit}>
    <h2>Admin sign-in</h2>
    <p>Per-user details are only visible to approved Pebble admin accounts.</p>
    <label>Email<input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required /></label>
    <label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>
    {error && <p className="dash-error" role="alert">{error}</p>}
    <button type="submit" disabled={busy || !supabase}>{busy ? 'Signing in…' : 'Sign in'}</button>
  </form>
}

function AdminUsers({ token }: { token: string }) {
  const [users, setUsers] = useState<User[] | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'lastSeen', desc: true })
  const load = useCallback(async () => {
    try {
      const data = await authorizedRequest('/api/usage/admin/users', UsersSchema)
      setUsers(data.users); setState('ready')
    } catch (error) {
      setState(error instanceof ApiRequestError && (error.status === 401 || error.status === 403) ? 'denied' : 'error')
    }
  }, [])
  useEffect(() => {
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    return () => clearInterval(timer)
  }, [load, token])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = (users ?? []).filter(user => !needle || user.displayName.toLowerCase().includes(needle) || user.username.toLowerCase().includes(needle))
    const direction = sort.desc ? -1 : 1
    return [...filtered].sort((a, b) => {
      const left = a[sort.key], right = b[sort.key]
      if (left === right) return a.displayName.localeCompare(b.displayName)
      if (left === null) return 1
      if (right === null) return -1
      const order = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right)
      return order * direction
    })
  }, [users, query, sort])

  if (state === 'denied') return <div className="dash-note" role="alert"><p>This account is not approved for per-user details.</p>
    <button type="button" onClick={() => void supabase?.auth.signOut({ scope: 'local' })}>Sign out</button></div>
  if (state === 'error') return <div className="dash-note" role="alert"><p>The user list could not be loaded.</p><button type="button" onClick={() => void load()}>Try again</button></div>
  if (!users) return <p className="dash-muted">Loading users…</p>

  return <section aria-label="Users">
    <div className="dash-toolbar">
      <input type="search" placeholder="Search name or username" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search users" />
      <span>{number.format(rows.length)} of {number.format(users.length)} users · {users.filter(user => user.online).length} online</span>
      <button type="button" onClick={() => void supabase?.auth.signOut({ scope: 'local' })}>Sign out</button>
    </div>
    <div className="dash-table-wrap">
      <table className="dash-table">
        <thead><tr>{columns.map(column => <th key={column.key} className={column.numeric ? 'num' : undefined} aria-sort={sort.key === column.key ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
          <button type="button" onClick={() => setSort(current => ({ key: column.key, desc: current.key === column.key ? !current.desc : column.numeric === true || column.key === 'lastSeen' }))}>
            {column.label}{sort.key === column.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
          </button></th>)}</tr></thead>
        <tbody>{rows.map(user => <tr key={user.id}>
          <td><div className="dash-person"><Avatar user={user} token={token} /><div><b>{user.displayName}</b><small>@{user.username}</small></div></div></td>
          <td>{user.online ? <span className="dash-online">Online now</span> : ago(user.lastSeen)}</td>
          <td className="num">{duration(user.minutesUsed)}</td>
          <td className="num">{number.format(user.daysActive)}</td>
          <td className="num">{number.format(user.messagesSent)}</td>
          <td className="num">{number.format(user.messagesReceived)}</td>
          <td className="num">{number.format(user.profileOpens)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="dash-muted">No users match.</p>}
    </div>
  </section>
}

export default function Dashboard() {
  const { session, ready } = useSession()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    document.title = 'Pebble · Dashboard'
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex'
    document.head.append(meta)
    return () => meta.remove()
  }, [])
  useEffect(() => {
    let live = true
    const load = () => authorizedRequest('/api/usage/summary', SummarySchema)
      .then(data => { if (live) { setSummary(data); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
    void load()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 30_000)
    return () => { live = false; clearInterval(timer) }
  }, [])

  return <main className="dash">
    <header><h1>Pebble dashboard</h1>{summary && <p>Updated {ago(summary.generatedAt)} · refreshes every 30 seconds</p>}</header>
    {failed && !summary && <div className="dash-note" role="alert"><p>The dashboard could not be loaded right now.</p></div>}
    {summary && <>
      <section className="dash-stats" aria-label="Totals">
        <Stat label="Members" value={summary.totalUsers} />
        <Stat label="Online now" value={summary.onlineNow} note="last 2 minutes" />
        <Stat label="Active today" value={summary.activeToday} />
        <Stat label="Active 7 days" value={summary.active7d} />
        <Stat label="Active 30 days" value={summary.active30d} />
        <Stat label="Hours used" value={Math.floor(summary.minutesTotal / 60)} note="all time" />
        <Stat label="Messages sent" value={summary.messagesTotal} note={`${number.format(summary.messages24h)} in 24h · ${number.format(summary.messages7d)} in 7d`} />
        <Stat label="Profile opens" value={summary.profileOpensTotal} />
      </section>
      <section className="dash-charts" aria-label="Last 30 days">
        <Bars series={summary.series} pick={day => day.activeUsers} label="Active people per day" />
        <Bars series={summary.series} pick={day => day.minutes} label="Minutes used per day" />
        <Bars series={summary.series} pick={day => day.profileOpens} label="Profile opens per day" />
      </section>
    </>}
    <section className="dash-admin" aria-label="Admin">
      <h2>People</h2>
      {!ready ? <p className="dash-muted">Checking sign-in…</p> : session ? <AdminUsers token={session.access_token} /> : <AdminSignIn />}
    </section>
    <footer>Public figures are totals only. Names, photos and per-person activity are visible to approved admins.</footer>
  </main>
}
