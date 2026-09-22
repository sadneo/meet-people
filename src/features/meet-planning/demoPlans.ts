// Isolated M2 fixtures. These are not matches, calendar data, or registry events.
export const people = [
  { name: 'You', initial: 'Y' },
  { name: 'Jamie', initial: 'J' },
  { name: 'Aaron', initial: 'A' },
] as const

export const timeSlots = [
  {
    id: 'tuesday', day: 'Tue, Sep 29', date: 'Tuesday, September 29, 2026',
    time: '3:00–4:00 PM', meetingTime: '3:00–3:45 PM',
    availability: ['Free', 'Free', 'Free'], available: true,
  },
  {
    id: 'wednesday', day: 'Wed, Sep 30', date: 'Wednesday, September 30, 2026',
    time: '5:00–6:00 PM', meetingTime: '5:00–5:45 PM',
    availability: ['Free', 'Free', 'Free'], available: true,
  },
  {
    id: 'thursday', day: 'Thu, Oct 1', date: 'Thursday, October 1, 2026',
    time: '12:00–1:00 PM', meetingTime: '12:00–12:45 PM',
    availability: ['Free', 'In class', 'Free'], available: false,
  },
] as const

export const planIdeas = [
  {
    id: 'coffee', title: 'Coffee & conversation',
    place: 'Campus café', cost: 'Buy your own drink',
    meetingPoint: 'Meet at the café’s front entrance.',
    icon: 'coffee',
  },
  {
    id: 'walk', title: 'A walk around campus',
    place: 'Main quad', cost: 'Free',
    meetingPoint: 'Meet by the main quad’s central benches.',
    icon: 'walk',
  },
  {
    id: 'games', title: 'A quick card game',
    place: 'Student union lounge', cost: 'Free · bring a deck',
    meetingPoint: 'Meet at the lounge entrance. You bring the cards.',
    icon: 'games',
  },
] as const

export type TimeSlot = (typeof timeSlots)[number]
export type PlanIdea = (typeof planIdeas)[number]
