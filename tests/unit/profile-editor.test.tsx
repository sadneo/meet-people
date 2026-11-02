import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Profile, PhotoEditor } from '../../src/ui/Profile';
import { ProfileSettings } from '../../src/ui/Settings';
import { accountFixture, requiredPreferences } from './complete-profile-fixture';

const mocks = vi.hoisted(() => ({ current: {} as Record<string, unknown>, photo: {} as Record<string, unknown>, facts: {} as Record<string, unknown>, detailed: {} as Record<string, unknown> }));
vi.mock('../../src/ui/current', () => ({ useCurrent: () => mocks.current }));
vi.mock('../../src/features/account/useProfilePhoto', () => ({ photoChangedEvent: 'pebble:profile-photo-changed', useProfilePhoto: () => mocks.photo }));
vi.mock('../../src/features/account/useProfileDetails', () => ({ useProfileDetails: () => mocks.facts }));
vi.mock('../../src/features/account/useDetailedSettings', () => ({ useDetailedSettings: () => mocks.detailed }));
vi.mock('../../src/ui/Preferences', () => ({ DatingPreferencesPanel: () => null }));

const upload = () => new File(['image'], 'photo.png', { type: 'image/png' });
const choose = (file = upload()) => fireEvent.change(screen.getByLabelText('Choose a photo'), { target: { files: [file] } });
const savePhoto = vi.fn(), reloadPhoto = vi.fn(), saveAccount = vi.fn(), saveFacts = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ revision: 2, timeZone: 'UTC', showAvailability: false })));
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:draft'), revokeObjectURL: vi.fn() }));
  savePhoto.mockResolvedValue({ revision: 5, hasPhoto: true });
  reloadPhoto.mockResolvedValue({ revision: 5, hasPhoto: true });
  saveAccount.mockResolvedValue(true); saveFacts.mockResolvedValue(true);
  mocks.current = { account: accountFixture({ username: 'synthetic', display_name: 'Synthetic', bio: null, avatar_url: null, ...requiredPreferences }), session: { user: { id: 'owner' }, access_token: 'token' }, busy: false, available: true, error: '', save: saveAccount, reload: vi.fn() };
  mocks.photo = { url: 'blob:saved', snapshot: { revision: 4, hasPhoto: true }, client: { save: savePhoto }, reload: reloadPhoto, loading: false, error: '' };
  mocks.facts = { details: { revision: 3, facts: { education: '', occupation: '', languages: [], visibility: { education: false, occupation: false, languages: false } } }, canWrite: true, busy: false, reload: vi.fn(), save: saveFacts };
  mocks.detailed = { loading: false, snapshot: null, error: '', reload: vi.fn() };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function editor() { return render(<MemoryRouter initialEntries={['/profile?section=basics']}><Profile/></MemoryRouter>); }

it('previews selection without a write and revokes its URL on Cancel', async () => {
  editor(); choose();
  await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  expect(savePhoto).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(savePhoto).not.toHaveBeenCalled(); expect(saveAccount).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft');
});

it('stages removal without a write and Cancel discards it', () => {
  editor(); fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(screen.getByText('Photo removal will be saved with Save changes.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(savePhoto).not.toHaveBeenCalled();
});

it.each(['choose', 'remove'])('saves a staged %s only with Save changes using its selected revision', async kind => {
  editor(); const file = upload();
  if (kind === 'choose') choose(file); else fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }));
  expect(savePhoto).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(savePhoto).toHaveBeenCalledWith(kind === 'choose' ? file : null, 4, expect.any(String)));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
  expect(reloadPhoto).toHaveBeenCalledOnce();
});

it('validates photos before staging and replaces/revokes previews', async () => {
  editor(); choose(new File(['text'], 'bad.txt', { type: 'text/plain' }));
  expect(screen.getByRole('alert').textContent).toContain('Choose a JPEG');
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  choose(); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
  choose(); await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:draft');
  expect(savePhoto).not.toHaveBeenCalled();
});

it('blocks duplicate writes and Cancel during a pending save', async () => {
  let finish!: () => void;
  savePhoto.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  editor(); choose(); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Saving…' }));
  expect(savePhoto).toHaveBeenCalledOnce();
  await act(async () => finish());
});

it('reports partial success and requires a successful read-only reload after an uncertain photo write', async () => {
  savePhoto.mockRejectedValueOnce(new Error('Disconnected'));
  reloadPhoto.mockResolvedValueOnce(null);
  editor(); fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Changed' } }); choose();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Profile details are saved.'));
  expect(saveAccount).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savePhoto).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved photo and discard photo draft' }));
  await waitFor(() => expect(reloadPhoto).toHaveBeenCalledOnce());
  expect((screen.getByLabelText('Choose a photo') as HTMLInputElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved photo and discard photo draft' }));
  await waitFor(() => expect(screen.queryByText('Photo selection will be saved with Save changes.')).toBeNull());
  expect(savePhoto).toHaveBeenCalledOnce();
});

it('does not overwrite a photo revision changed after selection', async () => {
  const view = editor(); choose();
  mocks.photo = { ...mocks.photo, snapshot: { revision: 6, hasPhoto: true } };
  view.rerender(<MemoryRouter initialEntries={['/profile?section=basics']}><Profile/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savePhoto).not.toHaveBeenCalled(); expect(saveAccount).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toContain('Reload the saved photo');
});

it('does not write the photo when main profile or optional details fail', async () => {
  saveFacts.mockResolvedValueOnce(false);
  editor(); choose();
  fireEvent.change(screen.getByLabelText('Education (optional)'), { target: { value: 'School' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('The photo has not been changed.'));
  expect(savePhoto).not.toHaveBeenCalled();
  saveAccount.mockResolvedValueOnce(false);
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Changed' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(saveAccount).toHaveBeenCalledOnce());
  expect(savePhoto).not.toHaveBeenCalled();
});

it('never retries a confirmed photo write when only its preview read fails', async () => {
  reloadPhoto.mockResolvedValueOnce(null);
  editor(); choose(); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Profile details and photo are saved'));
  expect(screen.queryByText('Photo selection will be saved with Save changes.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(savePhoto).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Reload saved photo and discard photo draft' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Reload saved photo and discard photo draft' })).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull());
  expect(savePhoto).toHaveBeenCalledOnce();
});

it('keeps standalone photo upload immediate and separate from the profile draft', async () => {
  render(<PhotoEditor/>); choose();
  fireEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
  await waitFor(() => expect(savePhoto).toHaveBeenCalledOnce());
});

it('offers the canonical sharing control in Privacy, not the unused legacy account flag', async () => {
  let schedule = { revision: 2, timeZone: 'UTC', showAvailability: false };
  vi.mocked(fetch).mockImplementation(async (_input, init) => {
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      schedule = { revision: body.expectedRevision + 1, timeZone: body.timeZone, showAvailability: body.showAvailability };
    }
    return Response.json(schedule);
  });
  render(<MemoryRouter><ProfileSettings section="privacy"/></MemoryRouter>);
  expect(screen.getByText(/Both places use the same setting/)).toBeTruthy();
  expect(screen.queryByRole('switch', { name: 'Share availability' })).toBeNull();
  fireEvent.click(screen.getByText('Timezone & shared availability'));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.getByLabelText('Allow shared-time explanations')).toBeTruthy();
  expect(screen.getByText(/Group proposals can show a common time/)).toBeTruthy();
  await waitFor(() => expect((screen.getByLabelText('Allow shared-time explanations') as HTMLInputElement).disabled).toBe(false));
  fireEvent.click(screen.getByLabelText('Allow shared-time explanations'));
  expect(vi.mocked(fetch).mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone & sharing' }));
  await screen.findByText('Timezone and sharing preference saved.');
  expect(schedule).toEqual({ revision: 3, timeZone: 'UTC', showAvailability: true });
  expect(JSON.parse(String(vi.mocked(fetch).mock.calls.find(call => call[1]?.method === 'PUT')?.[1]?.body))).toEqual({ expectedRevision: 2, timeZone: 'UTC', showAvailability: true });
  expect(saveAccount).not.toHaveBeenCalled();
});

it('explains the location gate and preserves independent availability on settings saves', async () => {
  render(<MemoryRouter><ProfileSettings section="discovery"/></MemoryRouter>);
  fireEvent.click(screen.getByRole('switch', { name: 'Allow device location for search areas' }));
  expect(screen.getByText(/this switch alone does not request coordinates/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saveAccount).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ availability: true, location: true }) })));
});
