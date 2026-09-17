import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { BottomNav, Button, EmptyState, PebbleScene } from '../src/design-system'

describe('design system', () => {
  it('identifies the active bottom navigation destination', () => {
    render(<MemoryRouter initialEntries={['/events']}><BottomNav /></MemoryRouter>)

    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Events' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current')).toBeNull()
  })

  it('supports primary and secondary actions', () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Start matching</Button>)

    fireEvent.click(screen.getByRole('button', { name: 'Start matching' }))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(<Button disabled variant="secondary">Cancel search</Button>)
    expect(screen.getByRole('button', { name: 'Cancel search' }).hasAttribute('disabled')).toBe(true)
  })

  it('describes scene state and gives empty states a next action', () => {
    render(
      <>
        <PebbleScene state="matching" />
        <EmptyState action={<Button>Start matching</Button>} title="No conversations yet">
          Conversations begin after you match.
        </EmptyState>
      </>,
    )

    expect(screen.getByRole('img', { name: 'Pebble looking around the meadow' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'No conversations yet' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Start matching' })).toBeTruthy()
  })
})
