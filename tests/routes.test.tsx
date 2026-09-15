import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('routes', () => {
  it('renders the home route', () => {
    render(
      <MemoryRouter initialEntries={['/']}><App /></MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Meet People' })).toBeTruthy()
  })

  it('renders the not-found route', () => {
    render(<MemoryRouter initialEntries={['/missing']}><App /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy()
  })
})
