export const activities = [
  { id: 'walk', title: 'A little walk, a new friend', category: 'OUTDOORS', detail: 'Take the scenic route around campus with a few friendly faces.', location: 'Ashley Schiff Preserve', time: '25 min', people: 4, reward: 40, art: 'walk' },
  { id: 'coffee', title: 'Good company, great coffee', category: 'JUST HANGING OUT', detail: 'A slow afternoon, your favorite drink, and a conversation that goes somewhere.', location: 'Library café', time: '45 min', people: 6, reward: 60, art: 'coffee' },
  { id: 'garden', title: 'Grow something together', category: 'GIVING BACK', detail: 'Plant a few seeds and meet the people making campus a little greener.', location: 'Community garden', time: '1 hour', people: 10, reward: 100, art: 'garden' },
] as const

export const stages = [
  { name: 'A little beginning', short: 'First pebble', description: 'Every community starts with a little hello.', cost: 0 },
  { name: 'Better together', short: 'Pebble pile', description: 'A few little connections. Something to build on.', cost: 40 },
  { name: 'A place to belong', short: 'Stone cottage', description: 'Small moments have made a place to call home.', cost: 60 },
  { name: 'Our little community', short: 'Pebble grove', description: 'Look what a little togetherness can grow.', cost: 100 },
] as const

export type RoofColor = 'terracotta' | 'sage' | 'blue'
export type Activity = typeof activities[number]
export type DemoAttendance = { proof: boolean; confirmations: number; collected: number }
export const emptyAttendance: DemoAttendance = { proof: false, confirmations: 0, collected: 0 }
export const proofReward = 10
export const confirmationReward = 10
export function earnedReward(attendance: DemoAttendance) {
  return attendance.proof ? proofReward + attendance.confirmations * confirmationReward : 0
}
export type DemoState = {
  balance: number
  stage: number
  attendance: Record<string, DemoAttendance>
  roof: RoofColor
  flowers: boolean
  message: string
  feedback: { serial: number; kind: 'earn' | 'spend'; amount: number } | null
}
export const initialState: DemoState = { balance: 0, stage: 0, attendance: {}, roof: 'terracotta', flowers: true, message: '', feedback: null }
type Action = { type: 'proof' | 'confirm' | 'confirm-all' | 'collect'; id: string } | { type: 'grow' } | { type: 'reset' } | { type: 'roof'; color: RoofColor } | { type: 'flowers' } | { type: 'clear-feedback' }

export function demoReducer(state: DemoState, action: Action): DemoState {
  switch (action.type) {
    case 'clear-feedback': return { ...state, feedback: null }
    case 'proof':
    case 'confirm':
    case 'confirm-all':
    case 'collect': {
      const activity = activities.find((item) => item.id === action.id)
      if (!activity) return state
      const previous = state.attendance[action.id] ?? emptyAttendance
      let attendance: DemoAttendance
      if (action.type === 'proof') {
        if (previous.proof) return state
        attendance = { ...previous, proof: true }
      } else if (action.type === 'confirm' || action.type === 'confirm-all') {
        if (!previous.proof || previous.confirmations >= activity.people - 1) return state
        attendance = { ...previous, confirmations: action.type === 'confirm-all' ? activity.people - 1 : previous.confirmations + 1 }
      } else {
        const amount = earnedReward(previous) - previous.collected
        if (amount <= 0) return state
        return {
          ...state,
          balance: state.balance + amount,
          attendance: { ...state.attendance, [action.id]: { ...previous, collected: earnedReward(previous) } },
          message: `+${amount} Pebbles collected from demo proof and confirmations.`,
          feedback: { serial: (state.feedback?.serial ?? 0) + 1, kind: 'earn', amount },
        }
      }
      return { ...state, attendance: { ...state.attendance, [action.id]: attendance } }
    }
    case 'grow': {
      const next = stages[state.stage + 1]
      if (!next || state.balance < next.cost) return state
      return { ...state, balance: state.balance - next.cost, stage: state.stage + 1, message: `${next.short} unlocked. ${next.description}`, feedback: { serial: (state.feedback?.serial ?? 0) + 1, kind: 'spend', amount: next.cost } }
    }
    case 'roof': return state.stage < 2 ? state : { ...state, roof: action.color, message: 'A fresh coat of color. Make yourself at home.' }
    case 'flowers': return state.stage < 2 ? state : { ...state, flowers: !state.flowers, message: state.flowers ? 'A simple, grassy garden.' : 'A few flowers to brighten the day.' }
    case 'reset': return { ...initialState, message: 'A fresh beginning. Your demo has been reset.' }
  }
}
