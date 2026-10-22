import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { CommunityWorld, UpgradePicture } from '../../src/features/prototype/CommunityWorld'
import { buildSections, emptyCommunity, landscapeUpgrades, parseCommunity, purchase, purchaseRefund, resetPurchases } from '../../src/features/prototype/economy'
import { parsePositions, type MovableId } from '../../src/features/prototype/community-placement'
import { initialState, reducer } from '../../src/features/prototype/model'

afterEach(cleanup)
const ids = landscapeUpgrades.map(item => item.id)

it('buys every landscape through the existing economy, persists receipts and refunds exactly once', () => {
  expect(buildSections.find(section => section.name === 'Landscape')?.items).toEqual(landscapeUpgrades)
  let community = { ...emptyCommunity, balance: 1000, freshStart: true }
  for (const item of landscapeUpgrades) {
    const before = community.balance
    community = { ...purchase(community, item.id), freshStart: true }
    expect(community.balance).toBe(before - item.cost)
    expect(purchase(community, item.id)).toBe(community)
    expect(purchase(emptyCommunity, item.id)).toBe(emptyCommunity)
  }
  const restored = parseCommunity(JSON.stringify(community))
  expect(restored.owned).toEqual(ids)
  expect(purchaseRefund(restored)).toBe(295)
  const reset = resetPurchases(restored)
  expect(reset).toMatchObject({ balance: 1000, owned: [], positions: {}, purchaseCosts: {}, freshStart: true })
  expect(resetPurchases(reset)).toBe(reset)
  expect(purchase(reset, 'river').balance).toBe(920)
})

it('restores each fixed landscape independently with existing artwork and keeps objects movable', () => {
  const { container, rerender } = render(<CommunityWorld owned={[]} freshStart onMove={() => {}} />)
  expect(container.querySelectorAll('[data-landscape]')).toHaveLength(0)
  for (const id of ids) {
    rerender(<CommunityWorld owned={[id, 'bench']} freshStart onMove={() => {}} />)
    expect(container.querySelectorAll(`[data-upgrade="${id}"]`)).toHaveLength(1)
    for (const node of container.querySelectorAll('[data-landscape]')) {
      expect(node.getAttribute('pointer-events')).toBe('none')
      expect(node.hasAttribute('data-movable')).toBe(false)
      expect(node.querySelector('[role="button"]')).toBeNull()
      expect(node.querySelector('image')?.getAttribute('href')).toContain('village-landscape.png')
    }
    expect(container.querySelector('[data-object="pebble"]')?.getAttribute('data-movable')).toBe('true')
    expect(container.querySelector('[data-object="bench"]')?.getAttribute('data-movable')).toBe('true')
    rerender(<UpgradePicture id={id} />)
    expect(container.querySelector('image')?.getAttribute('href')).toContain('village-landscape.png')
  }
})

it('ignores landscape positions in saves and movement actions, even when owned', () => {
  const positions = Object.fromEntries(ids.map(id => [id, { x: 600, y: 600 }]))
  expect(parsePositions(positions, ids)).toEqual({})
  const state = { ...initialState, community: { ...emptyCommunity, owned: ids } }
  for (const id of ids) expect(reducer(state, { type: 'move-community-item', id: id as MovableId, position: { x: 600, y: 600 } })).toBe(state)
})

it('keeps Sunday through Friday identical whether landscape is purchased or not', () => {
  const { container, rerender } = render(<CommunityWorld owned={[]} freshStart stage={0} />)
  for (let stage = 0; stage < 6; stage++) {
    rerender(<CommunityWorld owned={[]} freshStart stage={stage} />)
    const before = container.innerHTML
    rerender(<CommunityWorld owned={ids} freshStart stage={stage} />)
    expect(container.innerHTML).toBe(before)
  }
  rerender(<CommunityWorld owned={ids} freshStart />)
  expect(container.querySelectorAll('[data-upgrade]')).toHaveLength(ids.length)
  rerender(<CommunityWorld owned={[]} freshStart />)
  expect(container.querySelectorAll('[data-landscape], [data-upgrade]')).toHaveLength(0)
  expect(container.querySelectorAll('[data-object]')).toHaveLength(1)
  expect(container.querySelector('[data-object="pebble"]')?.getAttribute('transform')).toBe('translate(724 595)')
})
