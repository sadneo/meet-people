import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import App from '../src/App'

afterEach(cleanup)

function openPlanning() {
  render(<MemoryRouter initialEntries={['/chats/plan']}><App /></MemoryRouter>)
}

function chooseTime() {
  fireEvent.click(screen.getByRole('radio', { name: /Tue, Sep 29/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Choose an activity' }))
}

function chooseActivity() {
  fireEvent.click(screen.getByRole('radio', { name: 'Coffee & conversation' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review plan' }))
}

describe('meet planning prototype', () => {
  it('uses the Chats destination and requires an available time and an activity', () => {
    openPlanning()
    expect(screen.getByRole('link', { name: 'Chats' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getAllByRole('link')).toHaveLength(4)
    expect(screen.getByRole('radio', { name: /Jamie is in class/ }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Choose an activity' }).hasAttribute('disabled')).toBe(true)
    chooseTime()
    expect(screen.getByRole('button', { name: 'Review plan' }).hasAttribute('disabled')).toBe(true)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Choose an activity' }))
    chooseActivity()
    expect(screen.getByText(/Tuesday, September 29, 2026/)).toBeTruthy()
    expect(screen.getByText('You, Jamie and Aaron')).toBeTruthy()
  })

  it('preserves selections going back and updates the summary when the time or activity changes', () => {
    openPlanning()
    chooseTime()
    chooseActivity()
    fireEvent.click(screen.getByRole('button', { name: 'Change time' }))
    expect((screen.getByRole('radio', { name: /Tue, Sep 29/ }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Wed, Sep 30/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose an activity' }))
    expect((screen.getByRole('radio', { name: 'Coffee & conversation' }) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: 'A quick card game' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review plan' }))
    expect(screen.getByText(/Wednesday, September 30, 2026/)).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'A quick card game' })).toBeTruthy()
    expect(screen.getByText('Meet at the lounge entrance. You bring the cards.')).toBeTruthy()
  })

  it('confirms once, supports editing the result, and clears the plan on a fresh mount', () => {
    openPlanning()
    chooseTime()
    chooseActivity()
    fireEvent.click(screen.getByRole('button', { name: 'Make plan' }))
    expect(screen.getByRole('heading', { name: 'Your plan is ready' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Make plan' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Edit plan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Change activity' }))
    fireEvent.click(screen.getByRole('radio', { name: 'A walk around campus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Review plan' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make plan' }))
    expect(screen.getByRole('heading', { name: 'A walk around campus' })).toBeTruthy()
    cleanup()
    openPlanning()
    expect(screen.getByRole('heading', { name: 'Choose a shared time' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Choose an activity' }).hasAttribute('disabled')).toBe(true)
  })
})
