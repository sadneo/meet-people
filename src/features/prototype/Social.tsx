import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { usePrototype } from './context'
import { activities, interests, people, planDate, planTime } from './model'
import { Avatar, Avatars, Button, Chips, Empty, Header, Icon, Pebble } from './ui'
import { jamieMessages, sampleConversations } from './messaging'
import './messages.css'

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close() }, [])
  return <dialog ref={ref} className="pt-dialog" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose() }}><div className="pt-section-heading"><h2 id={titleId}>{title}</h2><button className="pt-icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{children}</dialog>
}
export function Messages() {
  const { state, dispatch, go, empty, setEmpty, chatPerson, setChatPerson } = usePrototype()
  const [search, setSearch] = useState('')
  const activity = activities.find(a => a.id === state.plan?.activity)
  const selected = chatPerson ?? (state.plan ? 'plan' : 'jamie')
  const visible = sampleConversations.filter(item => !state.blocked.includes(item.id) && `${people.find(person => person.id === item.id)?.name} ${state.messages[item.id]?.at(-1) ?? item.preview}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <>
    <Header title="Messages" sub="Good plans start with a conversation." />
    {!empty && <label className="pt-conversation-search"><Icon name="search" /><span className="pt-sr-only">Search conversations</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search conversations..." /></label>}
    {empty ? <Empty title="Your conversations start here" text="Find someone with a little time in common." action="Find people" onClick={() => { setEmpty(false); go('Free Time') }} /> : <div className="pt-conversations">
      {state.plan && !search && <button className={`pt-conversation ${selected === 'plan' ? 'is-selected' : ''}`} onClick={() => { setChatPerson(null); go('Chat') }}><span className="pt-group-avatar"><Avatars ids={state.plan.people} /></span><span><strong>You, {state.plan.people.map(id => people.find(p => p.id === id)?.first).join(' & ')}</strong><span>{state.messages.plan?.at(-1) ?? `${activity?.short} · ${planTime(state.plan)}`}</span><small className="pt-badge">Plan confirmed</small></span><small>Now</small></button>}
      {visible.map(item => {
        const person = people.find(person => person.id === item.id)!
        return <button key={item.id} className={`pt-conversation ${selected === item.id ? 'is-selected' : ''}`} aria-current={selected === item.id ? 'true' : undefined} onClick={() => { dispatch({ type: 'read', channel: item.id }); setChatPerson(item.id); go('Chat') }}><Avatar person={person} /><span><strong>{person.name}</strong><span>{state.messages[item.id]?.at(-1) ?? item.preview}</span></span><small>{item.time}{item.unread && !state.readChannels.includes(item.id) && <span className="pt-unread" aria-label="Unread conversation" />}</small></button>
      })}
      {!visible.length && <p className="pt-search-empty">{search ? 'No conversations found. Try another name.' : 'No conversations to show. Find people through matching.'}</p>}
    </div>}
  </>
}
export function Chat() {
  const { state, dispatch, go, empty, chatPerson, setPersonId } = usePrototype()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const attachment = useRef<HTMLInputElement>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const channel = chatPerson ?? (state.plan ? 'plan' : 'jamie')
  const message = drafts[channel] ?? ''
  const setMessage = (text: string) => setDrafts(drafts => ({ ...drafts, [channel]: text.slice(0, 1000) }))
  const conversation = state.messages[channel] ?? []
  const person = people.find(p => p.id === chatPerson) ?? people[0]
  const group = !chatPerson && state.plan
  const blocked = group ? !!state.plan?.people.some(id => state.blocked.includes(id)) : state.blocked.includes(person.id)
  const plan = group ? state.plan! : null
  const activity = activities.find(a => a.id === plan?.activity)
  useEffect(() => {
    const chat = bottom.current?.parentElement
    if (chat) chat.scrollTop = conversation.length ? chat.scrollHeight : 0
  }, [channel, conversation.length])
  const startPlan = () => { dispatch({ type: 'draft', patch: { people: plan?.people ?? [person.id], activity: 'coffee', time: '' } }); go('Planning') }
  const samples = group ? [{ text: 'Great, let’s make it happen!', time: '2:34 PM', mine: false }, { text: 'Here’s our plan. See you there!', time: '2:36 PM', mine: true }] : person.id === 'jamie' ? jamieMessages : [{ text: sampleConversations.find(item => item.id === person.id)?.preview.replace('...', '') ?? 'Hey! Good to meet you.', time: '11:18 AM', mine: false }]
  if (empty) return <div className="pt-chat-placeholder"><Icon name="messages" size={48} /><h2>A good conversation starts here.</h2><p>Choose matching to meet someone new.</p></div>
  return <>
    <header className="pt-chat-header">
      <button className="pt-icon-button pt-chat-back" aria-label="Back" onClick={() => go('Messages')}><Icon name="back" /></button>
      <div className="pt-chat-identity">
        {group ? <Avatars ids={plan!.people} /> : <button className="pt-avatar-link" aria-label="View profile" onClick={() => { setPersonId(person.id); go('Other User Profile') }}><Avatar person={person} /></button>}
        <div><h1 tabIndex={-1}>{group ? `You, ${plan!.people.map(id => people.find(p => p.id === id)?.first).join(' & ')}` : person.name}</h1><p><Icon name="matchmaking" size={19} />{group ? 'From your shared plan' : 'Met through event matchmaking'}</p></div>
      </div>
      <div className="pt-chat-tools"><button aria-label="Voice call" className="pt-chat-tool" onClick={() => setNotice('Voice call')}><Icon name="phone" /></button><button aria-label="Video call" className="pt-chat-tool" onClick={() => setNotice('Video call')}><Icon name="video" /></button><button aria-label="Conversation options" className="pt-chat-tool" onClick={() => setNotice('Conversation options')}><Icon name="more" /></button></div>
      <Button className="pt-chat-plan" disabled={blocked} onClick={startPlan}>Make a plan</Button>
    </header>
    <section className="pt-chat">
      <div className="pt-chat-date"><span>SAT, SEP 26 · DEMO MESSAGES</span></div>
      {blocked ? <div className="pt-inline-notice">A blocked person is in this conversation. Sending is disabled in this demo. <button className="pt-text-button" onClick={() => go('Settings')}>Manage blocked users</button></div> : samples.map((item, index) => <div className={`pt-message-row ${item.mine ? 'is-mine' : ''}`} key={`${channel}-${index}`}>{!item.mine && <Avatar person={person} size="small" />}<div className="pt-message-content"><div className={`pt-chat-bubble ${item.mine ? 'is-mine' : ''}`}>{item.text}</div><time>{item.time}</time></div></div>)}
      {plan && <div className="pt-shared-plan">
        <span className="pt-badge">Confirmed</span>
        <h2>{activity?.name ?? 'Make time for a coffee'}</h2>
        <p><strong>{planDate(plan)} · {planTime(plan)}</strong></p><p><Icon name="pin" size={17} />{activity?.place}</p><p>You + {plan.people.map(id => people.find(p => p.id === id)?.first).join(' + ')}</p><div className="pt-button-row"><Button onClick={() => go('Confirmed')}>View plan</Button><Button secondary onClick={() => { dispatch({ type: 'edit-plan' }); go('Planning') }}>Change plan</Button></div>
      </div>}
      {conversation.map((text, i) => <div className="pt-message-row is-mine" key={i}><div className="pt-message-content"><div className="pt-chat-bubble is-mine">{text}</div><span className="pt-message-sent">Just now · demo</span></div></div>)}
      <div ref={bottom} />
    </section>
    <form className="pt-composer" onSubmit={e => { e.preventDefault(); if (!blocked && message.trim()) { dispatch({ type: 'message', text: message, channel }); setMessage('') } }}>
      <button className="pt-chat-tool" type="button" aria-label="Attach a file" disabled={blocked} onClick={() => attachment.current?.click()}><Icon name="attachment" /></button><input ref={attachment} type="file" hidden aria-label="Choose demo attachment" onChange={event => { const file = event.target.files?.[0]; if (file) setMessage(`${message}${message ? ' ' : ''}[Demo attachment: ${file.name}]`); event.target.value = '' }} />
      <div className="pt-composer-field"><label className="pt-sr-only" htmlFor="pt-message">Message</label><input id="pt-message" value={message} maxLength={1000} disabled={blocked} onChange={e => setMessage(e.target.value)} placeholder="Write a message..." autoComplete="off" /><button type="button" className="pt-chat-tool" aria-label="Add an emoji" aria-expanded={emojiOpen} disabled={blocked} onClick={() => setEmojiOpen(!emojiOpen)}><Icon name="smile" /></button>{emojiOpen && <div className="pt-emoji-picker" aria-label="Choose an emoji">{['😊', '☕', '👋', '🌿', '🎉'].map(emoji => <button type="button" key={emoji} aria-label={`Insert ${emoji}`} onClick={() => { setMessage(message + emoji); setEmojiOpen(false) }}>{emoji}</button>)}</div>}</div><Button type="submit" disabled={!message.trim() || blocked}>Send<Icon name="arrow" size={18} /></Button>
    </form>
    {notice && <Modal title={notice} onClose={() => setNotice(null)}>{notice === 'Conversation options' ? <><Button secondary onClick={() => { setPersonId(person.id); go('Other User Profile') }}>View profile</Button><Button secondary onClick={() => { setNotice(null); go('Settings') }}>Privacy and blocked users</Button></> : <p>Calls are not connected in this demo. Keep the conversation going with a message, or make a plan to meet.</p>}</Modal>}
  </>
}
export function ChatDetails() {
  const { state, dispatch, go, empty, chatPerson, setPersonId } = usePrototype()
  const [detail, setDetail] = useState<'cafe' | 'event' | null>(null)
  const person = people.find(person => person.id === chatPerson) ?? people[0]
  const group = !chatPerson && state.plan
  const blocked = group ? state.plan!.people.some(id => state.blocked.includes(id)) : state.blocked.includes(person.id)
  const startPlan = () => { dispatch({ type: 'draft', patch: { people: group ? state.plan!.people : [person.id], activity: 'coffee', time: '' } }); go('Planning') }
  if (empty) return null
  return <>
    <section className="pt-contact-card">
      <img className="pt-contact-cover" src="/prototype/cafe-interior.jpg" alt="A warm café with plants and wooden tables" />
      <div className="pt-contact-body"><button className="pt-contact-avatar pt-avatar-link" aria-label={`View ${person.first}'s profile`} onClick={() => { setPersonId(person.id); go('Other User Profile') }}><Avatar person={person} size="large" /><span className="pt-demo-presence" aria-label="Sample presence indicator" /></button>
        <h2>{person.name}</h2><p className="pt-contact-source"><Icon name="matchmaking" size={19} />Met through event matchmaking</p>
        <div className="pt-contact-facts"><span><Icon name="graduation" size={19} />College student</span><span><Icon name="pin" size={19} />On campus</span><span><Icon name="cake" size={19} />{person.id === 'jamie' ? 'She/her' : 'Student'}</span></div>
        <p className="pt-contact-bio">{person.id === 'jamie' ? 'I love good coffee, live music, and exploring new spots around campus. Always up for a meaningful conversation!' : person.bio}</p>
        <div className="pt-contact-interests"><h3>Mutual interests</h3><div>{person.interests.filter(interest => state.profile.interests.includes(interest)).map(interest => <span key={interest}><Icon name={interest === 'Coffee' ? 'coffee' : interest === 'Music' ? 'music' : 'leaf'} size={19} />{interest === 'Music' ? 'Live music' : interest === 'Outdoors' ? 'Walks' : interest}</span>)}</div></div>
      </div>
    </section>
    <section className="pt-conversation-next"><Icon name="events" size={24} /><div><h2>Turn this into something real</h2><p>You both seem interested in meeting up.<br />Make a plan and keep the momentum going!</p><Button disabled={blocked} onClick={startPlan}>Make a plan<Icon name="arrow" size={18} /></Button></div></section>
    <button className="pt-shared-context" onClick={() => setDetail('cafe')}><div><span><Icon name="pin" size={17} />You both saved</span><strong>Brew House Café</strong><small>Café · 0.4 mi from campus</small></div><img src="/prototype/cafe-interior.jpg" alt="Brew House Café sample interior" /><Icon name="back" size={18} /></button>
    <button className="pt-shared-context" onClick={() => setDetail('event')}><div><span><Icon name="events" size={17} />Met at</span><strong>Fall Social Mixer</strong><small>Campus event · Sep 12, 2024</small></div><img src="/prototype/social-mixer.jpg" alt="An evening social gathering" /><Icon name="back" size={18} /></button>
    {detail && <Modal title={detail === 'cafe' ? 'Brew House Café' : 'Fall Social Mixer'} onClose={() => setDetail(null)}><p>{detail === 'cafe' ? 'A cozy café, 0.4 miles from campus. This is a sample saved place for the prototype.' : 'A sample campus event from Sep 12, 2024. Event matchmaking and attendance are simulated.'}</p><Button disabled={blocked} onClick={startPlan}>Make a plan</Button></Modal>}
  </>
}
export function Connection() {
  const { personId, state, dispatch, go, setChatPerson } = usePrototype()
  const person = people.find(p => p.id === personId) ?? people[0]
  const blocked = state.blocked.includes(person.id)
  return <><Header title="A little shared ground" /><section className="pt-connection pt-surface"><div className="pt-connection-people"><Avatar person={state.profile} size="large" /><Avatar person={person} size="large" /></div><h2>You and {person.first}</h2><p>{person.overlap} · {person.time} today</p><div className="pt-connection-stones" aria-hidden="true"><Pebble /><Pebble /></div><div className="pt-button-row"><Button disabled={blocked} onClick={() => { setChatPerson(person.id); go('Chat') }}>Message<Icon name="messages" /></Button><Button secondary disabled={blocked} onClick={() => { dispatch({ type: 'draft', patch: { people: [person.id], time: '' } }); go('Activities') }}>Make a plan<Icon name="arrow" /></Button></div><p className="pt-hint">Illustrative connection. No matching service.</p>{blocked && <p>This person is blocked in this demo.</p>}</section></>
}
export function ProfileScreen({ other = false }: { other?: boolean }) {
  const { state, dispatch, go, personId } = usePrototype()
  const person = people.find(p => p.id === personId) ?? people[0]
  const shown = other ? person : state.profile
  const [editing, setEditing] = useState(false)
  const [profile, setProfile] = useState(state.profile)
  const [safety, setSafety] = useState<'block' | 'report' | null>(null)
  const [reported, setReported] = useState(false)
  const [reason, setReason] = useState('')
  const blocked = state.blocked.includes(person.id)
  return <><Header title={other ? 'Profile' : 'Your profile'} back={other ? () => go('Free Time Match') : undefined} action={!other && <button className="pt-icon-button" aria-label="Settings" onClick={() => go('Settings')}><Icon name="settings" /></button>} /><div className="pt-profile-layout"><section className="pt-profile-person"><Avatar person={shown} size="large" /><h1>{shown.name}</h1><p className="pt-profile-location"><Icon name="pin" size={17} />Around campus</p><p className="pt-profile-bio">{shown.bio}</p><div className="pt-static-chips">{shown.interests.map(interest => <span key={interest}>{interest}</span>)}</div>{other ? <Button disabled={blocked} onClick={() => go('Connection')}>{blocked ? 'Blocked in this demo' : `Connect with ${person.first}`}<Icon name="arrow" size={18} /></Button> : <Button secondary onClick={() => { setProfile(state.profile); setEditing(true) }}>Edit profile</Button>}</section><section className="pt-profile-details">{other ? <><h2>Shared ground</h2><div className="pt-shared-ground"><div><Icon name="coffee" /><span><strong>{person.interests.filter(i => state.profile.interests.includes(i)).join(' · ') || 'Open to meeting new people'}</strong><small>Interests in common</small></span></div><div><Icon name="events" /><span><strong>{person.id === 'maya' ? 'A little fresh air' : 'Acoustic afternoon'}</strong><small>Shared event interest · sample</small></span></div><div><Icon name="time" /><span><strong>{person.time} today</strong><small>Mock availability overlap</small></span></div></div><div className="pt-safety-links"><button onClick={() => { setReported(false); setReason(''); setSafety('report') }}>Report user</button><button onClick={() => setSafety('block')}>{blocked ? 'Unblock user' : 'Block user'}</button></div></> : <><h2>Upcoming plans</h2>{state.plan ? <button className="pt-profile-plan" onClick={() => go('Confirmed')}><Icon name="events" /><span><strong>{activities.find(a => a.id === state.plan?.activity)?.name}</strong><span>{planDate(state.plan)} · {planTime(state.plan)}</span></span><Icon name="arrow" /></button> : <p>No plans yet. Find some free time in common.</p>}<div className="pt-profile-community"><Pebble /><div><h2>Your little community</h2><p>{state.community.balance} demo Pebbles · {state.completed.length}/4 chapters</p><span className="pt-hint">A small beginning, with room to grow.</span></div></div><button className="pt-settings-row" onClick={() => go('Settings')}><Icon name="settings" /><span>Settings & privacy</span><Icon name="arrow" /></button></>}</section></div>{editing && <Modal title="Edit your profile" onClose={() => setEditing(false)}><form onSubmit={e => { e.preventDefault(); if (profile.name.trim() && profile.bio.trim()) { dispatch({ type: 'profile', profile: { ...profile, name: profile.name.trim(), bio: profile.bio.trim() } }); setEditing(false) } }}><p className="pt-hint">Local demo edits. Your onboarding won’t replay.</p><label>Display name<input value={profile.name} required maxLength={30} onChange={e => setProfile({ ...profile, name: e.target.value })} /></label><label>Bio<textarea value={profile.bio} required maxLength={160} onChange={e => setProfile({ ...profile, bio: e.target.value })} /></label><fieldset><legend>Interests</legend><Chips label="Edit interests" options={interests} values={profile.interests} multi onChange={values => setProfile({ ...profile, interests: values })} /></fieldset><Button type="submit" className="pt-wide" disabled={!profile.name.trim() || !profile.bio.trim()}>Save profile</Button></form></Modal>}{safety && <Modal title={safety === 'report' ? `Report ${person.first}` : `${blocked ? 'Unblock' : 'Block'} ${person.first}?`} onClose={() => setSafety(null)}>{safety === 'block' ? <><p>{blocked ? 'They will appear in sample results again.' : 'They will be hidden from sample results. Messaging them will be disabled in this demo.'}</p><p className="pt-hint">Prototype control only. No real account is affected.</p><Button className="pt-wide" onClick={() => { dispatch({ type: blocked ? 'unblock' : 'block', id: person.id }); setSafety(null) }}>{blocked ? 'Unblock in demo' : 'Block in demo'}</Button></> : reported ? <div role="status"><p>Demo report recorded locally.</p><p className="pt-hint">This has not been sent to a moderation team. No real report was filed.</p><Button className="pt-wide" onClick={() => setSafety(null)}>Done</Button></div> : <form onSubmit={e => { e.preventDefault(); if (reason) setReported(true) }}><label>Reason<select required value={reason} onChange={e => setReason(e.target.value)}><option value="">Choose a reason</option><option>Harassment</option><option>Inappropriate content</option><option>Impersonation</option><option>Other concern</option></select></label><label>Additional context (optional)<textarea maxLength={400} placeholder="Use fictional details for this demo." /></label><p className="pt-hint">Prototype only. Nothing is submitted to a moderation team.</p><Button type="submit" className="pt-wide" disabled={!reason}>Submit demo report</Button></form>}</Modal>}</>
}
export function Settings() {
  const { state, dispatch, go } = usePrototype()
  const [account, setAccount] = useState(false)
  const toggle = (key: string, title: string, description: string) => <label className="pt-toggle-row"><span><strong>{title}</strong><small>{description}</small></span><input type="checkbox" checked={state.settings[key]} onChange={e => dispatch({ type: 'setting', key, value: e.target.checked })} /></label>
  return <><Header title="Settings" sub="Local prototype preferences" back={() => go('Profile')} /><div className="pt-settings"><section><h2>Account</h2><button className="pt-settings-row" onClick={() => setAccount(true)}><span>Account details</span><Icon name="arrow" /></button></section><section><h2>Notifications</h2>{toggle('notifications', 'Plan & message notifications', 'Show notifications about your conversations.')}</section><section><h2>Privacy</h2>{toggle('discoverable', 'Show me in discovery', 'Let other people find your profile.')}{toggle('availability', 'Share my availability', 'Show your free-time windows to connections.')}</section><section><h2>Location</h2>{toggle('location', 'Nearby suggestions', 'Demo setting only. No location access is requested.')}<p className="pt-hint">Campus is the fixed demo location.</p></section><section><h2>Safety & blocked users</h2><p>Block or report someone from their profile. These controls are mock UI for review.</p>{state.blocked.length ? state.blocked.map(id => <div className="pt-toggle-row" key={id}><strong>{people.find(p => p.id === id)?.name}</strong><Button secondary onClick={() => dispatch({ type: 'unblock', id })}>Unblock</Button></div>) : <p className="pt-hint">No blocked users in this session.</p>}</section><Button secondary onClick={() => go('Login')}>Log out of demo</Button><p className="pt-hint">No active account. Community purchases stay on this device.</p></div>{account && <Modal title="Demo account" onClose={() => setAccount(false)}><p><strong>{state.profile.name}</strong></p><p>alex@example.com</p><p className="pt-hint">Placeholder account details. Authentication and account management are not connected.</p><Button onClick={() => { setAccount(false); go('Profile') }}>Go to profile</Button></Modal>}</>
}
