import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Availability } from '../../src/ui/Profile';
import { MatchingProfileSchema } from '../../shared/matchmaking';

afterEach(cleanup);
const window = (dow: number, start_time: string, end_time: string) => ({ dow, start_time, end_time });
const profile = { username: 'test', display_name: 'Test', bio: null, birthdate: null, location_city: null, avatar_url: null, interests: [] };

it('flags both overlapping windows and blocks the shared profile save schema', () => {
  const availability = [window(1, '12:00:00', '17:00:00'), window(1, '16:00:00', '18:00:00')];
  render(<Availability value={availability} change={vi.fn()}/>);
  expect(screen.getAllByRole('alert')).toHaveLength(2);
  expect(screen.getAllByLabelText('From')[0].getAttribute('aria-invalid')).toBe('true');
  expect(MatchingProfileSchema.safeParse({ ...profile, availability }).success).toBe(false);
});

it.each([
  [window(1, '12:00:00', '17:00:00'), window(1, '17:00:00', '18:00:00')],
  [window(1, '12:00:00', '17:00:00'), window(2, '12:00:00', '17:00:00')],
  [window(1, '23:00:00', '24:00:00'), window(2, '00:00:00', '01:00:00')],
])('allows adjacent windows and the same hours on different days: %j', (...availability) => {
  render(<Availability value={availability} change={vi.fn()}/>);
  expect(screen.queryByRole('alert')).toBeNull();
  expect(MatchingProfileSchema.safeParse({ ...profile, availability }).success).toBe(true);
});

it('flags reversed or zero-length windows and clears errors when corrected', () => {
  const change = vi.fn();
  const { rerender } = render(<Availability value={[window(1, '17:00:00', '12:00:00')]} change={change}/>);
  expect(screen.getByRole('alert').textContent).toContain('end after the start');
  rerender(<Availability value={[window(1, '17:00:00', '17:00:00')]} change={change}/>);
  expect(screen.getByRole('alert')).toBeTruthy();
  rerender(<Availability value={[window(1, '12:00:00', '17:00:00')]} change={change}/>);
  expect(screen.queryByRole('alert')).toBeNull();
});
