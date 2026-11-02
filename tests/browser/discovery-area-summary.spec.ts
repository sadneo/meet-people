import { expect, test } from '@playwright/test'
import { emptyDatingProfile } from '../../shared/dating'
import { locationId, wiringFixture } from './wiring-fixture'

for (const confirmed of [false, true]) {
  test(`Dating header ${confirmed ? 'shows confirmed search area' : 'does not substitute profile home for an unconfirmed area'}`, async ({ page }) => {
    await wiringFixture(page)
    await page.route('**/api/matchmaking/dating/status', route => route.fulfill({ json: {
      available: true,
      aggregate: {
        profileRevision: 1, searchRevision: 1,
        profile: { ...emptyDatingProfile(), gender: 'Man', sexuality: 'Straight', clarifiedTargets: ['Woman'], intent: 'Long-term relationship', style: 'Monogamy' },
        search: { ageMin: 18, ageMax: 99, radiusMiles: 15, searchArea: { source: 'home', resolvedLocationRef: confirmed ? locationId : null } },
        eligibility: { asOf: '2026-10-27', adult: true, locationResolved: confirmed },
        effectiveEnabled: false,
      },
      canStart: confirmed, globalDiscovery: true, datingDiscovery: true,
    } }))
    await page.goto('/matchmaking?mode=dating')
    const area = page.getByRole('button', { name: 'Search area & preferences' })
    await expect(area).toContainText(confirmed ? 'Campus' : 'Choose an area')
    if (!confirmed) await expect(area).not.toContainText('Campus')
  })
}
