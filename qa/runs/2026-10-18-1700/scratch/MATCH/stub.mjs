// Real matching 503s locally (no embedding service), so candidate-card tests stub only GET /api/matchmaking/result.
export const IDS = { carol: '33333333-3333-4333-8333-333333333333', hank: '88888888-8888-4888-8888-888888888888', jack: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', kim: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
export function candidate(over = {}) {
  return { id: IDS.jack, name: 'Jack Murphy', avatar: null, interests: ['basketball', 'cooking'], overlap: 'some', mode: 'downtime', meetup: null, ...over }
}
export async function stubResult(page, cand) {
  await page.route('**/api/matchmaking/result', route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Cache-Control': 'no-store' }, body: JSON.stringify({ candidate: cand }) }))
}
