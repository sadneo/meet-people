import { canShowDating, meetsMinimumAge } from './age-visibility'
import './parity-account.css'
import { MatchingSchedule } from './MatchingSchedule';
import { DatingPreferencesPanel } from './Preferences';
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import {
  SaveAccountSchema,
  type Account,
} from "../../shared/account";
import { AvailabilitySchema, type MatchingProfile } from "../../shared/matchmaking";
import type { ProfileDetails } from "../../shared/profile-details";
import { ProfileFactsSchema } from '../../shared/profile-details';
import { globalInterestChoices } from "../features/account/global-interests";
import { customInterestLimit, interestAdditionProblem, interestCounts, interestLimit } from '../../shared/interests';
import { useProfileDetails } from "../features/account/useProfileDetails";
import {
  photoChangedEvent,
  useProfilePhoto,
} from "../features/account/useProfilePhoto";
import { useAction } from "./hooks";
import {
  ActionButton,
  Avatar,
  Icon,
  ErrorMessage,
  ResourceState,
  Modal,
} from "./common";
import { useCurrent } from "./current";
import { ProfileSettings, ProfileSettingsLinks } from './Settings';
import { settingsCategories } from './settings-navigation';
import { LanguagePicker } from './LanguagePicker';

const weekdays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const suggestions = globalInterestChoices;
export function Interests({
  value,
  change,
  compact = false,
}: {
  value: string[];
  change: (value: string[]) => void;
  compact?: boolean;
}) {
  const [custom, setCustom] = useState("");
  return (
    <fieldset>
      <legend className={compact ? 'sr-only' : undefined}>Interests · choose at least one from the list or your own</legend>
      <div className="interest-chips">
        {[...new Set([...suggestions, ...value])].map((label) => (
          <button
            type="button"
            key={label}
            className={`chip ${value.includes(label) ? "selected" : ""}`}
             aria-pressed={value.includes(label)}
            disabled={!value.includes(label) && value.length >= interestLimit}
            onClick={() =>
              change(
                value.includes(label)
                  ? value.filter((item) => item !== label)
                  : value.length < interestLimit
                    ? [...value, label]
                    : value,
              )
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="grow">
          {compact ? 'Add your own' : 'Custom interest'}
          <input
            maxLength={120}
            disabled={value.length >= interestLimit || interestCounts(value).custom >= customInterestLimit}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
        <ActionButton
          secondary
          disabled={!!interestAdditionProblem(custom, value)}
          onClick={() => {
            if (!interestAdditionProblem(custom, value))
              change([...value, custom.trim()]);
            setCustom("");
          }}
        >
          Add
        </ActionButton>
      </div>
    </fieldset>
  );
}
export function Availability({
  value,
  change,
}: {
  value: MatchingProfile["availability"];
  change: (value: MatchingProfile["availability"]) => void;
}) {
  const errorId = useId();
  const errors = value.map((window, index) => {
    if (!AvailabilitySchema.safeParse(window).success) return 'Choose valid times, with the end after the start.';
    const overlap = value.findIndex((other, i) => i !== index && AvailabilitySchema.safeParse(other).success && window.dow === other.dow && window.start_time < other.end_time && other.start_time < window.end_time);
    return overlap === -1 ? '' : `This time overlaps window ${overlap + 1} on ${weekdays[window.dow]}.`;
  });
  return (
    <fieldset>
      <legend>Your usual week</legend>
      {value.map((window, index) => (
        <div className="availability-inputs" key={index}>
          <label>
            Day
            <select
              value={window.dow}
              onChange={(event) =>
                change(
                  value.map((item, i) =>
                    i === index ? { ...item, dow: +event.target.value } : item,
                  ),
                )
              }
            >
              {weekdays.map((name, dow) => (
                <option key={name} value={dow}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="time"
              required
              aria-invalid={!!errors[index]}
              aria-describedby={errors[index] ? `${errorId}-${index}` : undefined}
              value={window.start_time.slice(0, 5)}
              onChange={(event) =>
                change(
                  value.map((item, i) =>
                    i === index
                      ? { ...item, start_time: event.target.value + ":00" }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label>
            Until
            <input
              type="time"
              required
              aria-invalid={!!errors[index]}
              aria-describedby={errors[index] ? `${errorId}-${index}` : undefined}
              disabled={window.end_time === "24:00:00"}
              value={
                window.end_time === "24:00:00"
                  ? "00:00"
                  : window.end_time.slice(0, 5)
              }
              onChange={(event) =>
                change(
                  value.map((item, i) =>
                    i === index
                      ? { ...item, end_time: event.target.value + ":00" }
                      : item,
                  ),
                )
              }
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={window.end_time === "24:00:00"}
              onChange={(event) =>
                change(
                  value.map((item, i) =>
                    i === index
                      ? {
                          ...item,
                          end_time: event.target.checked
                            ? "24:00:00"
                            : "23:00:00",
                        }
                      : item,
                  ),
                )
              }
            />
            Ends at midnight
          </label>
          <ActionButton
            secondary
            onClick={() => change(value.filter((_, i) => i !== index))}
          >
            Remove
          </ActionButton>
          {errors[index] && <p className="error availability-error" role="alert" id={`${errorId}-${index}`}>{errors[index]}</p>}
        </div>
      ))}
      <ActionButton
        secondary
        disabled={value.length >= 56}
        onClick={() =>
          change([
            ...value,
            { dow: 1, start_time: "12:00:00", end_time: "17:00:00" },
          ])
        }
      >
        Add a time window
      </ActionButton>
    </fieldset>
  );
}
export function PhotoEditor({ compact = false }: { compact?: boolean }) {
  const photo = useProfilePhoto(),
    current = useCurrent(),
    action = useAction(),
    [reconcile, setReconcile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputId = useId();
  async function save(remove: boolean) {
    await action.run(async () => {
      if (!photo.client || !photo.snapshot || (!remove && !file) || reconcile)
        return;
      if (
        file &&
        !remove &&
        (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024)
      )
        throw new Error("Choose a JPEG, PNG or WebP image up to 5 MB.");
      setReconcile(true);
      await photo.client.save(
        remove ? null : file,
        photo.snapshot.revision,
        crypto.randomUUID(),
      );
      window.dispatchEvent(
        new CustomEvent(photoChangedEvent, { detail: current.session.user.id }),
      );
      setReconcile(false);
      setFile(null);
    });
  }
  return (
    <section className={compact ? 'profile-photo-editor' : 'account-panel'}>
      {!compact && <h3>Your photo</h3>}
      <div className={compact ? 'profile-edit-photo' : undefined}>
      <Avatar
        name={current.account?.profile?.display_name ?? ""}
        url={photo.url}
        large
      />
      {compact && <div><label className="account-edit-text" htmlFor={inputId}>Edit Photo</label>{photo.snapshot?.hasPhoto && <button className="account-edit-text is-danger" aria-label="Remove photo" type="button" disabled={photo.loading || action.busy || reconcile} onClick={() => void save(true)}>Remove</button>}</div>}
      </div>
      <ResourceState
        loading={photo.loading}
        error={photo.error}
        reload={photo.reload}
      />
      <label className={compact ? 'sr-only' : undefined}>
        Choose a photo
        <input
          type="file"
          id={inputId}
          accept="image/jpeg,image/png,image/webp"
          disabled={action.busy || photo.loading || !!photo.error || reconcile}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <ErrorMessage>{action.error}</ErrorMessage>
      <div className="row wrap">
        {(!compact || file) && <ActionButton
          disabled={
            !file ||
            !photo.snapshot ||
            photo.loading ||
            !!photo.error ||
            action.busy ||
            reconcile
          }
          onClick={() => void save(false)}
        >
          Upload photo
        </ActionButton>}
        {!compact && <ActionButton
          secondary
          disabled={
            !photo.snapshot?.hasPhoto ||
            photo.loading ||
            !!photo.error ||
            action.busy ||
            reconcile
          }
          onClick={() => void save(true)}
        >
          Remove photo
        </ActionButton>}
        {reconcile && (
          <ActionButton
            secondary
            disabled={action.busy}
            onClick={() => {
              void photo.reload().then(saved => { if (saved) setReconcile(false); });
            }}
          >
            Reload photo before retrying
          </ActionButton>
        )}
      </div>
    </section>
  );
}
export function Profile() {
  const current = useCurrent(),
    facts = useProfileDetails(
      current.session.user.id,
      current.session.access_token,
    );
  const photo = useProfilePhoto();
  const [search, setSearch] = useSearchParams();
  const [preview, setPreview] = useState(false);
  const adult = canShowDating(current.account?.profile?.birthdate);
  const requestedSection = search.get('section') === 'dating' && !adult ? 'basics' : search.get('section');
  const section = requestedSection === 'basics' || requestedSection === 'interests' || requestedSection === 'dating' ? requestedSection : null;
  function setSection(value: 'basics' | 'interests' | 'dating') {
    const next = new URLSearchParams(search);
    next.set('section', value);
    setSearch(next);
  }
  function closeEditor() {
    const next = new URLSearchParams(search);
    next.delete('section');
    setSearch(next, {replace:true});
    void facts.reload();
  }
  const profile = current.account?.profile;
  const settingsCategory = settingsCategories.find(category => category[0] === requestedSection);
  if (requestedSection === 'settings')
    return <div className="account-page settings-page"><div className="pagehead"><h2>Settings</h2></div><div className="settings-profile-summary"><Avatar name={profile?.display_name ?? ''} url={photo.url}/><div><b>{profile?.display_name}</b><p>{current.session.user.email}</p></div></div><ProfileSettingsLinks/><Link className="account-logout" to="/logout">Sign out of Pebble</Link></div>;
  if (settingsCategory)
    return <ProfileSettings key={settingsCategory[0]} section={settingsCategory[0]}/>;
  if (requestedSection === 'friends-preferences' || requestedSection === 'dating-preferences')
    return <Navigate replace to={`/matchmaking?mode=${requestedSection === 'dating-preferences' ? 'dating' : 'friends'}&preferences=true`}/>;
  return (
    <div className="account-page profile-page live-profile">
      <div className="pagehead">
        <h2>{section ? 'Edit profile' : 'Profile'}</h2>
        <div className="row"><button type="button" className="btn light small" onClick={() => setPreview(true)}>Preview</button>{!section && <Link className="round" aria-label="Settings" to="/profile?section=settings"><Icon name="Settings"/></Link>}</div>
      </div>
      {!section ? <div className="profile-overview">
        <div className="profile-summary"><Avatar name={profile?.display_name ?? ''} url={photo.url} large/><div><h3>{profile?.display_name}</h3><p>{profile?.location_city || 'Add your home area'}</p></div><button className="account-edit-text" aria-label="Edit profile" onClick={() => setSection('basics')}>Edit</button></div>
        <p className="profile-saved-bio">{profile?.bio || 'Add a little about yourself.'}</p>
        <div className="account-group">
          <button className="account-row" onClick={() => setSection('basics')}><span className="account-row-icon"><Icon name="Profile"/></span><span className="account-row-copy"><b>About you</b><small>Photo, bio, home & personal details</small></span><Icon name="ChevronRight"/></button>
          <button className="account-row" onClick={() => setSection('interests')}><span className="account-row-icon"><Icon name="Events"/></span><span className="account-row-copy"><b>Interests & availability</b><small>{profile?.interests.length ?? 0} interests · {profile?.availability.length ?? 0} saved time windows</small></span><Icon name="ChevronRight"/></button>
          {adult && <button className="account-row" onClick={() => setSection('dating')}><span className="account-row-icon"><Icon name="Dating"/></span><span className="account-row-copy"><b>Dating details</b><small>Your identity & intentions</small></span><Icon name="ChevronRight"/></button>}
        </div>
        <p className="account-note">{adult ? 'Profile details are shared. Your Friends and Dating search preferences stay separate.' : 'Your profile and Friends search preferences stay separate.'}</p>
        <div className="account-group">
          <Link className="account-row" to="/matchmaking?mode=friends&preferences=true"><span className="account-row-icon"><Icon name="Friends"/></span><span className="account-row-copy"><b>Friends preferences</b><small>Who you’d like to meet & search area</small></span><Icon name="ChevronRight"/></Link>
          {adult && <Link className="account-row" to="/matchmaking?mode=dating&preferences=true"><span className="account-row-icon"><Icon name="Dating"/></span><span className="account-row-copy"><b>Dating preferences</b><small>Who you’d like to date & search area</small></span><Icon name="ChevronRight"/></Link>}
        </div>
      </div> : <>
        {(section === 'basics' || section === 'interests' || section === 'dating') && <div className="account-segments" role="group" aria-label="Profile sections">{(['basics', 'interests', 'dating'] as const).filter(tab => tab !== 'dating' || adult).map((tab, i) => <button key={tab} aria-pressed={section === tab} onClick={() => setSection(tab)}>{['About You', 'Interests & Availability', 'Dating Profile'][i]}</button>)}</div>}
        <div hidden={section !== 'basics' && section !== 'interests'}>
          <ResourceState loading={facts.loading} error={facts.error} reload={() => void facts.reload()}/>
          {facts.details && <ProfileDraft initial={current.account!} initialFacts={facts.details} factsResource={facts} section={section === 'interests' ? 'interests' : 'basics'} done={closeEditor}/>}
        </div>
        {adult && section === 'dating' && <section className="account-edit-fields"><DatingPreferencesPanel view="profile" done={closeEditor}/></section>}
      </>}
      {preview && <Modal className="account-preview-modal" title="Your profile" close={() => setPreview(false)}>
        <p className="account-note">Preview of your saved profile. Your full schedule and birthdate stay private.</p>
        <div className="own-profile-photo"><Avatar name={profile?.display_name ?? ''} url={photo.url} large/><div><h2>{profile?.display_name}</h2><p>{profile?.location_city}</p></div></div>
        {profile?.bio && <section className="own-preview-section"><h3>About you</h3><p>{profile.bio}</p></section>}
        {!!profile?.interests.length && <section className="own-preview-section"><h3>Interests</h3><div className="own-preview-interests">{profile.interests.map(interest => <span className="chip" key={interest}>{interest}</span>)}</div></section>}
        {facts.details && <dl className="own-profile-facts">{(['education', 'occupation', 'languages'] as const).filter(key => facts.details!.facts.visibility[key] && facts.details!.facts[key].length).map(key => <div key={key}><dt>{key[0].toUpperCase() + key.slice(1)}</dt><dd>{Array.isArray(facts.details!.facts[key]) ? (facts.details!.facts[key] as string[]).join(', ') : facts.details!.facts[key]}</dd></div>)}</dl>}
      </Modal>}
    </div>
  );
}

function ProfileDraft({ initial, initialFacts, factsResource, section, done }: {
  initial: Account;
  initialFacts: ProfileDetails;
  factsResource: ReturnType<typeof useProfileDetails>;
  section: 'basics' | 'interests';
  done: () => void;
}) {
  const current = useCurrent(), formId = useId();
  const photo = useProfilePhoto(), photoInputId = useId();
  const [photoDraft, setPhotoDraft] = useState<{ file: File | null; revision: number; preview: string | null } | null>(null);
  const [photoReconcile, setPhotoReconcile] = useState(false);
  const saveLock = useRef(false);
  useEffect(() => {
    const url = photoDraft?.preview;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [photoDraft]);
  const [source, setSource] = useState(initial.profile);
  const [profile, setProfile] = useState(() => structuredClone(initial.profile!));
  const [facts, setFacts] = useState(() => structuredClone(initialFacts.facts));
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  if (source !== initial.profile) {
    setSource(initial.profile);
    setProfile(structuredClone(initial.profile!));
    setError('');
  }
  const update = (value: Partial<MatchingProfile>) => setProfile(before => ({ ...before, ...value }));
  const busy = saving || current.busy || factsResource.busy;
  function stagePhoto(file: File | null) {
    if (busy || photo.loading || photo.error || !photo.snapshot || photoReconcile) return;
    if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024 || file.size === 0)) {
      setError('Choose a JPEG, PNG or WebP image up to 5 MB.');
      return;
    }
    setError('');
    setPhotoDraft({ file, revision: photo.snapshot.revision, preview: file ? URL.createObjectURL(file) : null });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || saveLock.current) return;
    setError('');
    if (photoReconcile || photoDraft && (!photo.client || photo.loading || photo.error || !photo.snapshot || photoDraft.revision !== photo.snapshot.revision)) {
      setPhotoReconcile(true);
      setError('Reload the saved photo before saving again. Other profile drafts are still here.');
      return;
    }
    const parsed = SaveAccountSchema.safeParse({ ...current.account!, profile });
    const optional = ProfileFactsSchema.safeParse(facts);
    if (!parsed.success || !optional.success) {
      setError(!parsed.success ? parsed.error.issues[0].message : !optional.success ? optional.error.issues[0].message : 'Check your profile.');
      return;
    }
    if (profile.birthdate && !meetsMinimumAge(profile.birthdate)) {
      setError("You must be at least 13 to use Pebble.");
      return;
    }
    const factsChanged = JSON.stringify(optional.data) !== JSON.stringify(initialFacts.facts);
    if (factsChanged && !factsResource.canWrite) {
      setError('Reload optional details before saving again. Your draft is still here.');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    let savedDetails = false;
    let photoAttempted = false;
    try {
      if (JSON.stringify(profile) !== JSON.stringify(current.account?.profile) && !await current.save(parsed.data)) return;
      if (factsChanged && !await factsResource.save({ expectedRevision: initialFacts.revision, facts: optional.data })) {
        setError('Your main profile is saved, but optional details could not be confirmed. The photo has not been changed. Reload optional details before trying again.');
        return;
      }
      savedDetails = true;
      if (photoDraft) {
        setPhotoReconcile(true);
        photoAttempted = true;
        await photo.client!.save(photoDraft.file, photoDraft.revision, crypto.randomUUID());
        setPhotoDraft(null);
        window.dispatchEvent(new CustomEvent(photoChangedEvent, { detail: current.session.user.id }));
        if (!await photo.reload()) {
          setError('Profile details and photo are saved, but the photo preview could not be refreshed. Reload the saved photo before continuing.');
          return;
        }
        setPhotoReconcile(false);
      }
      done();
    } catch (failure) {
      setError(photoAttempted
        ? `${savedDetails ? 'Profile details are saved. ' : ''}The photo change could not be confirmed and may already be saved. Reload the saved photo before retrying. ${failure instanceof Error ? failure.message : ''}`
        : 'Profile details could not be confirmed. Reload account and optional details before retrying. The photo has not been changed.');
    } finally { saveLock.current = false; setSaving(false); }
  }
  return <div className="profile-editor">
    <div className="account-edit-fields">
      {section === 'basics' && <section className="profile-photo-editor">
        <div className="profile-edit-photo">
          <Avatar name={profile.display_name} url={photoDraft ? photoDraft.preview : photo.url} large/>
          <div><label className="account-edit-text" htmlFor={photoInputId}>Edit Photo</label>{(photoDraft ? !!photoDraft.file : photo.snapshot?.hasPhoto) && <button className="account-edit-text is-danger" aria-label="Remove photo" type="button" disabled={busy || photo.loading || !!photo.error || photoReconcile} onClick={() => stagePhoto(null)}>Remove</button>}</div>
        </div>
        <ResourceState loading={photo.loading} error={photo.error} reload={() => { void photo.reload(); }}/>
        <label className="sr-only">Choose a photo<input id={photoInputId} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || photo.loading || !!photo.error || !photo.snapshot || photoReconcile} onChange={event => { const file = event.target.files?.[0]; if (file) stagePhoto(file); event.target.value = ''; }}/></label>
      </section>}
      {photoDraft && <p className="account-note">Photo {photoDraft.file ? 'selection' : 'removal'} will be saved with Save changes.</p>}
      {photoReconcile && <ActionButton secondary disabled={busy || photo.loading} onClick={() => { void photo.reload().then(saved => { if (saved) { setPhotoDraft(null); setPhotoReconcile(false); setError('Saved photo reloaded. Any unsaved photo selection was discarded.'); } }); }}>Reload saved photo and discard photo draft</ActionButton>}
      <form id={formId} className="profile-draft" onSubmit={event => void save(event)}>
        <fieldset disabled={busy || !current.available}>
          <div hidden={section !== 'basics'}>
            <label>Display name<input required maxLength={120} autoComplete="nickname" value={profile.display_name} onChange={event => update({ display_name: event.target.value })}/></label>
            <label>Bio <span className="profile-bio-count">{profile.bio?.length ?? 0}/1000</span><textarea maxLength={1000} rows={3} value={profile.bio ?? ''} onChange={event => update({ bio: event.target.value || null })}/></label>
            <label>Birthdate (private)<input type="date" value={profile.birthdate ?? ''} max={new Date().toISOString().slice(0,10)} onChange={event => update({ birthdate: event.target.value || null })}/></label>
            <p className="account-note">Your birthdate is private. Only your age is shown.</p>
            <label>Home area<input maxLength={120} value={profile.location_city ?? ''} onChange={event => update({ location_city: event.target.value || null })}/></label>
            <p className="account-note">A general area only. Temporary search areas are separate.</p>
            <fieldset disabled={!factsResource.canWrite}>
              {(['education', 'occupation'] as const).map(key => <div key={key}>
                <label>{key === 'education' ? 'Education' : 'Occupation'} (optional)<input maxLength={120} value={facts[key]} onChange={event => setFacts({ ...facts, [key]: event.target.value })}/></label>
                <label className="account-check"><input type="checkbox" checked={facts.visibility[key]} onChange={event => setFacts({ ...facts, visibility: { ...facts.visibility, [key]: event.target.checked } })}/>Show {key}</label>
              </div>)}
              <LanguagePicker value={facts.languages} change={languages => setFacts({ ...facts, languages })}/>
              <label className="account-check"><input type="checkbox" checked={facts.visibility.languages} onChange={event => setFacts({ ...facts, visibility: { ...facts.visibility, languages: event.target.checked } })}/>Show languages</label>
            </fieldset>
            <details className="profile-account-details"><summary>Account username</summary><label>Username<input required maxLength={80} value={profile.username} onChange={event => update({ username: event.target.value })}/></label></details>
          </div>
          <div hidden={section !== 'interests'}>
            <h3 className="account-section-label">Interests <span>{profile.interests.length}/{interestLimit}</span></h3>
            <Interests compact value={profile.interests} change={interests => update({ interests })}/>
            <div className="account-divider"/>
            <h3 className="account-section-label">Weekly availability</h3>
            <p className="account-note">{profile.availability.length ? `${profile.availability.length} saved time ${profile.availability.length === 1 ? 'window' : 'windows'}` : 'Add times that usually work for you.'}</p>
            <div className="profile-availability"><Availability value={profile.availability} change={availability => update({ availability })}/></div>
          </div>
        </fieldset>
      </form>
      {section === 'interests' && <MatchingSchedule compact token={current.session.access_token} disabled={busy} onSaved={() => window.dispatchEvent(new Event('pebble:matching-changed'))}/>}
      <ErrorMessage>{error || current.error || factsResource.error}</ErrorMessage>
      {current.error && <ActionButton secondary onClick={current.reload}>Reload account and replace draft before saving again</ActionButton>}
      {!factsResource.canWrite && <ActionButton secondary disabled={busy} onClick={() => { void factsResource.reload().then(saved => { if (saved) { setFacts(structuredClone(saved.facts)); setError(''); } }); }}>Reload saved optional details to replace this draft</ActionButton>}
    </div>
    <div className="profile-save-bar"><button className="btn light" type="button" disabled={busy} onClick={done}>Cancel</button><button className="btn" form={formId} disabled={busy || !current.available}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </div>;
}
