import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Profile } from '../../src/ui/Profile';
import { accountFixture, requiredPreferences } from './complete-profile-fixture';

const mocks = vi.hoisted(() => ({ current: {} as Record<string, unknown>, facts: {} as Record<string, unknown>, toast: vi.fn() }));
vi.mock('../../src/ui/current', () => ({ useCurrent: () => mocks.current }));
vi.mock('../../src/ui/feedback', async importOriginal => ({ ...await importOriginal<typeof import('../../src/ui/feedback')>(), toast: mocks.toast }));
vi.mock('../../src/features/account/useProfilePhoto', () => ({ photoChangedEvent: 'pebble:profile-photo-changed', useProfilePhoto: () => ({ url: null, snapshot: { revision: 1, hasPhoto: false }, client: {}, reload: vi.fn(), loading: false, error: '' }) }));
vi.mock('../../src/features/account/usePhotoGallery', () => ({ usePhotoGallery: () => ({ query: {} }) }));
vi.mock('../../src/features/account/useProfileDetails', () => ({ useProfileDetails: () => mocks.facts }));
vi.mock('../../src/features/matchmaking/useDatingPreferences', () => ({ useDatingPreferences: () => ({ snapshot: { profile: { intent: 'Something casual', style: 'Monogamy' } } }) }));
vi.mock('../../src/ui/Preferences', () => ({ DatingPreferencesPanel: () => null }));
vi.mock('../../src/features/account/profile-customization-client', async () => {
  const { defaultProfileCustomization } = await import('../../shared/profile-customization');
  return { useProfileCustomization: () => ({ query: { data: { revision: 0, customization: defaultProfileCustomization } }, value: defaultProfileCustomization, save: vi.fn() }), useProfileShowcase: () => ({ data: null }), useProfilePrompts: () => ({ data: [] }) };
});
vi.mock('../../src/ui/PhotoGallery', async importOriginal => ({ ...await importOriginal<typeof import('../../src/ui/PhotoGallery')>(), PhotoGalleryPanel: () => null, DiscoverPhotos: () => null }));
vi.mock('../../src/ui/ProfileCustomization', async importOriginal => ({ ...await importOriginal<typeof import('../../src/ui/ProfileCustomization')>(), GardenShowcasePicker: () => null }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function close() { this.removeAttribute('open'); };
  Element.prototype.scrollIntoView = vi.fn();
  mocks.current = { account: accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: 'Hi', avatar_url: null, ...requiredPreferences }), session: { user: { id: 'owner' }, access_token: 'token' }, busy: false, available: true, error: '', save: vi.fn(async () => true), reload: vi.fn() };
  mocks.facts = { details: { revision: 3, facts: { education: 'UC Berkeley', occupation: 'Barista', languages: [], visibility: { education: true, occupation: true, languages: false } } }, canWrite: true, busy: false, reload: vi.fn(), save: vi.fn(async () => true) };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const editor = () => render(<MemoryRouter initialEntries={['/profile?section=basics']}><Profile/></MemoryRouter>);

it('points at an empty prompt from inside the save bar', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Choose a prompt'), { target: { value: 'study-spot' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toBe('Answer each prompt or remove it.');
  expect(alert.closest('.profile-save-bar')).not.toBeNull();
  await waitFor(() => expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true'));
});

it('previews the unsaved draft as the real per-mode card', () => {
  editor();
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Drafty' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const preview = within(screen.getByRole('dialog', { name: 'Preview' }));
  expect(preview.getByRole('heading', { level: 2, name: /^Drafty, \d+$/ })).toBeTruthy();
  expect(preview.getByText('Barista · Fixture campus')).toBeTruthy();
  expect(preview.queryByText('Looking for')).toBeNull();
  fireEvent.click(preview.getByRole('button', { name: 'Dating' }));
  expect(preview.getByText('Looking for')).toBeTruthy();
  expect(preview.getByText('Relationship style')).toBeTruthy();
  expect(preview.getByText('UC Berkeley')).toBeTruthy();
});

it('confirms a save with a toast', async () => {
  editor();
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith('Profile saved'));
});

it('hides the tab bar while editing on a phone', () => {
  const css = readFileSync('src/ui/profile-customization.css', 'utf8');
  expect(css).toMatch(/\.shell:has\(\.profile-editor\) > \.app-navigation \{ display: none; \}/);
});
