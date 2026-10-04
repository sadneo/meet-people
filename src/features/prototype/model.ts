import { emptyCommunity, purchase, type Community, type UpgradeId } from './economy'
// Everything in this module is local design-review data, not a service contract.
export const scenes = ['Home', 'Matchmaking', 'Downtime Matchmaking', 'Intro', 'Login', 'Register', 'Onboarding', 'Events', 'Event Detail', 'Free Time', 'Free Time Match', 'Activities', 'Planning', 'Review', 'Confirmed', 'Messages', 'Chat', 'Connection', 'Profile', 'Other User Profile', 'Settings'] as const
export type Scene = typeof scenes[number]
export const sceneSlug = (scene: Scene) => scene.toLowerCase().replaceAll(' ', '-')
export const scenePaths: Record<Scene, string> = {
  Home: '/',
  Matchmaking: '/matchmaking',
  'Downtime Matchmaking': '/downtime-matchmaking',
  Intro: '/intro',
  Login: '/login',
  Register: '/register',
  Onboarding: '/onboarding',
  Events: '/events',
  'Event Detail': '/events/detail',
  'Free Time': '/free-time',
  'Free Time Match': '/free-time/matches',
  Activities: '/free-time/activities',
  Planning: '/free-time/plan',
  Review: '/free-time/review',
  Confirmed: '/free-time/confirmed',
  Messages: '/messages',
  Chat: '/messages/chat',
  Connection: '/free-time/connection',
  Profile: '/profile',
  'Other User Profile': '/profile/person',
  Settings: '/settings',
}
export const interests = ['Music', 'Gaming', 'Sports', 'Food', 'Outdoors', 'Art', 'Movies', 'Fitness', 'Study', 'Coffee', 'Photography']
export const intents = ['Meet new people', 'Find people for events', 'Casual hangouts', 'Activity buddies', 'Study buddies']
export const DEMO_CHAPTER_REWARD = 10
export const people = [
  { id: 'jamie', name: 'Jamie Chen', first: 'Jamie', photo: 'jamie.jpg', bio: 'Usually looking for a good coffee, a new playlist, or an excuse to be outside.', interests: ['Coffee', 'Music', 'Outdoors'], overlap: 'Coffee & low-key hangouts', time: '3–6 PM', color: 'sage' },
  { id: 'aaron', name: 'Aaron Patel', first: 'Aaron', photo: 'aaron.jpg', bio: 'Board games, pickup games, and finding the best food near campus.', interests: ['Gaming', 'Food', 'Sports'], overlap: 'Games & trying new food', time: '3–5 PM', color: 'clay' },
  { id: 'maya', name: 'Maya Brooks', first: 'Maya', photo: 'maya.jpg', bio: 'Camera in my bag. Always up for a walk or a quiet study session.', interests: ['Photography', 'Outdoors', 'Study'], overlap: 'Walks & study breaks', time: '4–6 PM', color: 'sand' },
  { id: 'alex-park', name: 'Alex Park', first: 'Alex', photo: 'aaron.jpg', bio: 'Always up for live music, a good meal, and meeting someone new.', interests: ['Music', 'Food', 'Coffee'], overlap: 'Live music & coffee', time: '3–6 PM', color: 'sage' },
  { id: 'taylor', name: 'Taylor Kim', first: 'Taylor', photo: 'maya.jpg', bio: 'Weekend farmers markets, long walks, and a good book.', interests: ['Outdoors', 'Food', 'Photography'], overlap: 'Walks & weekend markets', time: '4–6 PM', color: 'sand' },
  { id: 'jordan', name: 'Jordan Lee', first: 'Jordan', photo: 'jordan.jpg', bio: 'Finding new places around campus, one coffee at a time.', interests: ['Coffee', 'Music', 'Food'], overlap: 'Coffee & new places', time: '3–6 PM', color: 'clay' },
  { id: 'morgan', name: 'Morgan Park', first: 'Morgan', photo: 'morgan.jpg', bio: 'A little fresh air and something fun to look forward to.', interests: ['Outdoors', 'Music', 'Art'], overlap: 'Walks & live music', time: '3–6 PM', color: 'sage' },
]
export type Person = typeof people[number]
export const activities = [
  { id: 'coffee', name: 'Coffee & a catch-up', short: 'Coffee', place: 'Campus café', point: 'Meet by the front counter', duration: '45 minutes', cost: '$4–8 each', distance: '0.3 mi', icon: 'coffee' },
  { id: 'games', name: 'A round of board games', short: 'Board games', place: 'Student Union lounge', point: 'Meet at the long table on floor 1', duration: '45 minutes', cost: 'Free', distance: '0.4 mi', icon: 'games' },
  { id: 'walk', name: 'A walk around campus', short: 'Walk', place: 'Main quad', point: 'Meet beside the library steps', duration: '45 minutes', cost: 'Free', distance: '0.2 mi', icon: 'tree' },
  { id: 'event', name: 'Acoustic afternoon', short: 'Campus event', place: 'Student Union courtyard', point: 'Meet at the courtyard entrance', duration: '45 minutes', cost: 'Free', distance: '0.4 mi', icon: 'music' },
  { id: 'food', name: 'Grab an early bite', short: 'Food', place: 'Campus food court', point: 'Meet at the main entrance', duration: '45 minutes', cost: '$8–12 each', distance: '0.5 mi', icon: 'food' },
  { id: 'study', name: 'A focused study session', short: 'Study session', place: 'Library common area', point: 'Meet near the ground-floor windows', duration: '45 minutes', cost: 'Free', distance: '0.2 mi', icon: 'book' },
]
export type Activity = typeof activities[number]
export const events = [
  { id: 'acoustic', title: 'Acoustic afternoon', category: 'Music', image: 'music.jpg', when: 'Sat, Sep 26 · 3–6 PM', place: 'Student Union courtyard', price: 'Free', distance: '0.4 mi', people: ['jamie', 'aaron'], description: 'An easy afternoon of live music from campus artists. Drop in, grab a seat, and find someone to enjoy the set with.', activity: 'event' },
  { id: 'coffee', title: 'Coffee & conversation', category: 'Food', image: 'coffee.jpg', when: 'Sat, Sep 26 · 3–6 PM', place: 'Campus café', price: '$4–8', distance: '0.3 mi', people: ['jamie', 'maya'], description: 'A relaxed coffee break with new people. No agenda and no pressure to stay all afternoon.', activity: 'coffee' },
  { id: 'walk', title: 'A little fresh air', category: 'Outdoors', image: 'walk.jpg', when: 'Sat, Sep 26 · 3–6 PM', place: 'Main quad', price: 'Free', distance: '0.2 mi', people: ['maya', 'jamie'], description: 'Take the scenic route around campus. A gentle walk, a few photo stops, and a chance to meet someone new.', activity: 'walk' },
]
export const times = [
  { id: '15:00', label: '3:00–3:45 PM', unavailable: ['maya'] },
  { id: '16:00', label: '4:00–4:45 PM', unavailable: [] },
  { id: '17:00', label: '5:00–5:45 PM', unavailable: ['aaron'] },
]
export type Profile = { name: string; bio: string; photo: string; interests: string[]; intents: string[]; usual: string[]; distance: string; group: string }
export type Draft = { when: string; date: string; customTime: string; vibe: string; distance: string; people: string[]; activity: string; time: string; note: string }
export type Plan = Draft & { status: 'Confirmed' }
export type State = { profile: Profile; draft: Draft; plan: Plan | null; completed: number[]; messages: Record<string, string[]>; blocked: string[]; settings: Record<string, boolean>; readChannels: string[]; community: Community }
export const initialState: State = {
  community: emptyCommunity,
  profile: { name: 'Alex', bio: 'Coffee breaks, new friends, and a little time outside.', photo: 'you.jpg', interests: ['Coffee', 'Music', 'Gaming', 'Outdoors'], intents: ['Meet new people'], usual: ['Afternoons'], distance: '5 miles', group: 'Either' },
  draft: { when: 'Later today', date: '2026-09-26', customTime: '16:00', vibe: 'Low-key', distance: 'Nearby', people: [], activity: '', time: '', note: '' },
  plan: null, completed: [], messages: {}, blocked: [], settings: { notifications: true, availability: true, discoverable: true, location: false }, readChannels: [],
}
export type Action =
  | { type: 'build'; id: UpgradeId }
  | { type: 'demo-funds' }
  | { type: 'reset-community' }
  | { type: 'draft'; patch: Partial<Draft> }
  | { type: 'profile'; profile: Profile }
  | { type: 'chapter'; chapter: number; profile: Profile }
  | { type: 'confirm' }
  | { type: 'edit-plan' }
  | { type: 'message'; text: string; channel: string }
  | { type: 'setting'; key: string; value: boolean }
  | { type: 'read'; channel: string }
  | { type: 'block'; id: string }
  | { type: 'unblock'; id: string }
export function availableTimes(draft: Draft) {
  if (draft.when === 'Tonight') return [{ id: '19:00', label: '7:00–7:45 PM', unavailable: [] }, { id: '20:00', label: '8:00–8:45 PM', unavailable: ['maya'] }]
  if (draft.when === 'Pick a time') return [{ id: draft.customTime, label: `${formatClock(draft.customTime)} · 45 minutes`, unavailable: [] }]
  return times
}
export function validPlan(draft: Draft, blocked: string[] = []) {
  return /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && Number.isFinite(new Date(`${draft.date}T12:00:00`).getTime()) && !!draft.time && draft.people.length > 0 && draft.people.every(id => people.some(person => person.id === id) && !blocked.includes(id)) && activities.some(activity => activity.id === draft.activity) && availableTimes(draft).some(time => time.id === draft.time && !draft.people.some(id => time.unavailable.includes(id)))
}
export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'build': return { ...state, community: purchase(state.community, action.id) }
    case 'demo-funds': return { ...state, community: { ...state.community, balance: Math.min(1_000_000, state.community.balance + 100) } }
    case 'reset-community': return { ...state, community: { ...state.community, balance: 0, owned: [] } }
    case 'draft': return { ...state, draft: { ...state.draft, ...action.patch } }
    case 'profile': return { ...state, profile: action.profile }
    case 'chapter': {
      const valid = [!!action.profile.photo && !!action.profile.name.trim() && !!action.profile.bio.trim(), !!action.profile.interests.length, !!action.profile.intents.length, !!action.profile.usual.length][action.chapter]
      if (!valid || ![0, 1, 2, 3].includes(action.chapter) || Array.from({ length: action.chapter }, (_, i) => i).some(i => !state.completed.includes(i))) return state
      const earned = state.community.earnedChapters.includes(action.chapter)
      return { ...state, profile: action.profile, completed: state.completed.includes(action.chapter) ? state.completed : [...state.completed, action.chapter], community: earned ? state.community : { ...state.community, balance: state.community.balance + DEMO_CHAPTER_REWARD, earnedChapters: [...state.community.earnedChapters, action.chapter] } }
    }
    case 'confirm': return validPlan(state.draft, state.blocked) ? { ...state, plan: { ...state.draft, people: [...state.draft.people], status: 'Confirmed' } } : state
    case 'edit-plan': return state.plan ? { ...state, draft: { ...state.plan, people: [...state.plan.people] } } : state
    case 'message': return action.text.trim() ? { ...state, messages: { ...state.messages, [action.channel]: [...(state.messages[action.channel] ?? []), action.text.trim()] } } : state
    case 'setting': return { ...state, settings: { ...state.settings, [action.key]: action.value } }
    case 'read': return { ...state, readChannels: [...new Set([...state.readChannels, action.channel])] }
    case 'block': return { ...state, blocked: [...new Set([...state.blocked, action.id])], draft: { ...state.draft, people: state.draft.people.filter(id => id !== action.id), time: '' } }
    case 'unblock': return { ...state, blocked: state.blocked.filter(id => id !== action.id) }
  }
}
export function formatClock(value: string) {
  const [hour, minute] = value.split(':').map(Number)
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`
}
export function planDate(draft: Draft) {
  return new Date(`${draft.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
export function planTime(draft: Draft) { return availableTimes(draft).find(time => time.id === draft.time)?.label ?? 'Choose a time' }
