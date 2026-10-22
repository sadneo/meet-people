import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CommunityWorld } from '../../src/features/prototype/CommunityWorld'
import { communityWeek, historyWeekCount } from '../../src/features/prototype/community-history'
import { upgrades } from '../../src/features/prototype/economy'

afterEach(cleanup)
it('starts each demo week on Sunday at stage zero and ends on Saturday at stage six', () => {
  for (let week = 0; week < historyWeekCount; week++) {
    const days = communityWeek(week, new Date(2026, 9, 13))
    expect(days.map(day => day.date.getDay())).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(days.map(day => day.stage)).toEqual([0, 1, 2, 3, 4, 5, 6])
  }
})

it('shows only one centered Pebble on Sunday even with every upgrade owned, then adds cumulatively', () => {
  const owned = upgrades.map(upgrade => upgrade.id)
  const { container, rerender } = render(<CommunityWorld owned={owned} stage={0} />)
  const features = () => [...container.querySelectorAll('[data-object]')].map(el => el.getAttribute('data-object') ?? el.getAttribute('data-terrain'))
  expect(features()).toEqual(['pebble'])
  expect(container.querySelector('[data-object="pebble"]')?.getAttribute('transform')).toBe('translate(724 595)')
  let previous = features()
  for (let stage = 1; stage <= 6; stage++) {
    rerender(<CommunityWorld owned={owned} stage={stage} />)
    const current = features()
    expect(current.length).toBeGreaterThan(previous.length)
    expect(current).toEqual(expect.arrayContaining(previous))
    expect(container.querySelector('[data-platform-shadow]')?.getAttribute('href')).toContain('community-village.png')
    expect(container.querySelector('[data-village-base]')?.hasAttribute('clip-path')).toBe(true)
    if (stage < 6) expect(container.querySelectorAll('[data-movable]')).toHaveLength(0)
    previous = current
  }
  expect(container.querySelectorAll('[data-upgrade]')).toHaveLength(owned.length)
  expect(owned).toEqual(upgrades.map(upgrade => upgrade.id))
})

it('renders a persisted fresh start like Sunday and adds purchases without restoring village scenery', () => {
  const { container, rerender } = render(<CommunityWorld owned={[]} stage={0} />)
  const sundayBase = container.querySelector('[data-village-base]')?.getAttribute('href')
  rerender(<CommunityWorld owned={[]} stage={6} freshStart onMove={() => {}} />)
  expect(container.querySelector('[data-village-base]')?.getAttribute('href')).toBe(sundayBase)
  expect(container.querySelectorAll('[data-object]')).toHaveLength(1)
  expect(container.querySelector('[data-object="pebble"]')?.getAttribute('transform')).toBe('translate(724 595)')
  expect(container.querySelectorAll('[data-terrain]')).toHaveLength(0)
  rerender(<CommunityWorld owned={['garnet']} stage={6} freshStart onMove={() => {}} />)
  expect(container.querySelectorAll('[data-object]')).toHaveLength(2)
  expect(container.querySelector('[data-upgrade="garnet"]')?.getAttribute('data-movable')).toBe('true')
  expect(container.querySelector('[data-village-base]')?.getAttribute('href')).toBe(sundayBase)
  rerender(<CommunityWorld owned={['garnet']} stage={4} freshStart />)
  expect(container.querySelector('[data-object="base-cottage"]')).not.toBeNull()
  expect(container.querySelector('[data-terrain="river"]')).not.toBeNull()
})
