import { MatchingSchedule } from './MatchingSchedule';
import { DatingPreferencesPanel, FriendsPreferencesPanel } from './Preferences';
import { useId, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  completedAccountChapters,
  SaveAccountSchema,
  type Account,
} from "../../shared/account";
import type { MatchingProfile } from "../../shared/matchmaking";
import type { ProfileDetails } from "../../shared/profile-details";
import { ProfileFactsSchema } from '../../shared/profile-details';
import { safeReturnTo } from "../auth/returnTo";
import { globalInterestChoices } from "../features/account/global-interests";
import { useProfileDetails } from "../features/account/useProfileDetails";
import { useDatingPreferences } from '../features/matchmaking/useDatingPreferences';
import { useFriendsPreferences } from '../features/matchmaking/useFriendsPreferences';
import {
  photoChangedEvent,
  useProfilePhoto,
} from "../features/account/useProfilePhoto";
import { useAction } from "./hooks";
import {
  ActionButton,
  Avatar,
  Icon,
  Modal,
  Brand,
  ErrorMessage,
  ResourceState,
} from "./common";
import { useCurrent } from "./current";

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
      <legend className={compact ? 'sr-only' : undefined}>Interests · choose at least three</legend>
      <div className="interest-chips">
        {[...new Set([...suggestions, ...value])].map((label) => (
          <button
            type="button"
            key={label}
            className={`chip ${value.includes(label) ? "selected" : ""}`}
            aria-pressed={value.includes(label)}
            onClick={() =>
              change(
                value.includes(label)
                  ? value.filter((item) => item !== label)
                  : value.length < 30
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
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
          />
        </label>
        <ActionButton
          secondary
          disabled={!custom.trim() || value.length >= 30}
          onClick={() => {
            if (!value.includes(custom.trim()))
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
  return (
    <fieldset>
      <legend>Your usual week · America/New_York</legend>
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
      <p className="account-note">
        Choose non-overlapping windows. Add overnight availability as two
        windows on consecutive days.
      </p>
    </fieldset>
  );
}
export function AccountForm({
  initial,
  onboarding = false,
}: {
  initial: Account;
  onboarding?: boolean;
}) {
  const current = useCurrent(),
    navigate = useNavigate(),
    [search] = useSearchParams();
  const [draft, setDraft] = useState<Account>(() => structuredClone(initial)),
    [validation, setValidation] = useState(""),
    [saved, setSaved] = useState(false);
  const profile = draft.profile ?? {
    username: "",
    display_name: "",
    bio: null,
    birthdate: null,
    location_city: null,
    avatar_url: null,
    interests: [],
    availability: [],
  };
  const chapter = onboarding ? completedAccountChapters(initial).length : -1;
  const identity = chapter === 0 || chapter === -1,
    interests = chapter === 1 || chapter === -1,
    intent = chapter === 2 || chapter === -1,
    preferences = chapter >= 3 || chapter === -1;
  const update = (value: Partial<MatchingProfile>) => {
    setSaved(false);
    setDraft({ ...draft, profile: { ...profile, ...value } });
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    setSaved(false);
    const value = {
      ...draft,
      profile,
      completed: onboarding
        ? [0, 1, 2, 3].slice(0, Math.min(4, chapter + 1))
        : initial.completed,
    };
    const parsed = SaveAccountSchema.safeParse(value);
    if (!parsed.success) {
      setValidation(
        parsed.error.issues[0]?.message ?? "Complete the required fields.",
      );
      return;
    }
    if (
      preferences &&
      (!profile.birthdate ||
        profile.birthdate > new Date().toISOString().slice(0, 10))
    ) {
      setValidation("Enter a valid birthdate in the past.");
      return;
    }
    if (await current.save(parsed.data)) {
      if (onboarding && chapter >= 3)
        navigate(safeReturnTo(search.get("returnTo")) ?? "/", {
          replace: true,
        });
      else setSaved(true);
    }
  }
  return (
    <form className="account-form" onSubmit={(event) => void submit(event)}>
      <fieldset disabled={current.busy || current.loading}>
        {identity && (
          <>
            <label>
              Username
              <input
                autoComplete="username"
                value={profile.username}
                maxLength={80}
                required
                onChange={(event) => update({ username: event.target.value })}
              />
            </label>
            <label>
              Display name
              <input
                autoComplete="name"
                required
                maxLength={120}
                value={profile.display_name}
                onChange={(event) =>
                  update({ display_name: event.target.value })
                }
              />
            </label>
            <label>
              Bio
              <textarea
                maxLength={1000}
                value={profile.bio ?? ""}
                onChange={(event) =>
                  update({ bio: event.target.value || null })
                }
              />
            </label>
          </>
        )}
        {interests && (
          <Interests
            value={profile.interests}
            change={(interests) => update({ interests })}
          />
        )}
        {intent && (
          <fieldset>
            <legend>What would you like to do?</legend>
            {[
              ...new Set([
                "Make friends",
                "Find study buddies",
                "Meet activity partners",
                "Date",
                ...draft.preferences.intents,
              ]),
            ].map((label) => (
              <label className="check-row" key={label}>
                <input
                  type="checkbox"
                  checked={draft.preferences.intents.includes(label)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      profile,
                      preferences: {
                        ...draft.preferences,
                        intents: event.target.checked
                          ? [...draft.preferences.intents, label]
                          : draft.preferences.intents.filter(
                              (item) => item !== label,
                            ),
                      },
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
        )}
        {preferences && (
          <>
            <div className="formgrid">
              <label>
                Birthdate · private
                <input
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                  value={profile.birthdate ?? ""}
                  onChange={(event) =>
                    update({ birthdate: event.target.value || null })
                  }
                />
              </label>
              <label>
                City or campus area
                <input
                  required
                  maxLength={120}
                  value={profile.location_city ?? ""}
                  onChange={(event) =>
                    update({ location_city: event.target.value || null })
                  }
                />
              </label>
            </div>
            <div className="formgrid">
              <label>
                Distance
                <select
                  required
                  value={draft.preferences.distance}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      profile,
                      preferences: {
                        ...draft.preferences,
                        distance: event.target
                          .value as Account["preferences"]["distance"],
                      },
                    })
                  }
                >
                  <option value="">Choose a distance</option>
                  {["Nearby", "5 miles", "10 miles"].map((label) => (
                    <option key={label}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                Group preference
                <select
                  required
                  value={draft.preferences.group}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      profile,
                      preferences: {
                        ...draft.preferences,
                        group: event.target
                          .value as Account["preferences"]["group"],
                      },
                    })
                  }
                >
                  <option value="">Choose a group size</option>
                  {["One-on-one", "Small groups", "Either"].map((label) => (
                    <option key={label}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <Availability
              value={profile.availability}
              change={(availability) => update({ availability })}
            />
          </>
        )}
      </fieldset>
      <ErrorMessage>{validation || current.error}</ErrorMessage>
      {current.error && (
        <ActionButton secondary onClick={current.reload}>
          Reload account before saving again
        </ActionButton>
      )}
      {saved && <p role="status">Profile saved.</p>}
      <button
        className="btn"
        disabled={current.busy || !current.available || current.loading}
      >
        {current.busy
          ? "Saving…"
          : onboarding
            ? chapter >= 3
              ? "Finish setup"
              : "Continue"
            : "Save profile"}
      </button>
    </form>
  );
}
export function Onboarding() {
  const current = useCurrent(),
    step = completedAccountChapters(current.account!).length;
  if (step >= 4)
    return (
      <main className="auth-screen">
        <Brand />
        <p>Your profile is ready.</p>
        <Link className="btn" to="/">
          Enter Pebble
        </Link>
      </main>
    );
  return (
    <main className="auth-screen onboarding">
      <Brand />
      <p className="muted">Step {step + 1} of 4</p>
      <h1>
        {
          [
            "Start with you.",
            "Your kind of things.",
            "What brings you here?",
            "Make room for a hello.",
          ][step]
        }
      </h1>
      <AccountForm key={step} initial={current.account!} onboarding />
      <SignOut />
    </main>
  );
}
function SignOut() {
  return (
    <Link className="text-link" to="/logout">
      Sign out
    </Link>
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
      {compact && <div><label className="account-edit-text" htmlFor={inputId}>Change photo</label>{photo.snapshot?.hasPhoto && <button className="account-edit-text is-danger" aria-label="Remove photo" type="button" disabled={photo.loading || action.busy || reconcile} onClick={() => void save(true)}>Remove</button>}</div>}
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
          disabled={action.busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {compact && <p className="account-note">One photo · JPG, PNG or WebP · up to 5 MB. Photo changes save separately.</p>}
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
              photo.reload();
              setReconcile(false);
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
  const friends = useFriendsPreferences(current.session.user.id, current.session.access_token, current.busy);
  const dating = useDatingPreferences(current.session.user.id, current.session.access_token, current.busy);
  const [search, setSearch] = useSearchParams();
  const requestedSection = search.get('section');
  const [section, setSection] = useState<'basics' | 'interests' | 'dating' | 'friends-preferences' | 'dating-preferences' | null>(() => requestedSection === 'friends-preferences' || requestedSection === 'dating-preferences' ? requestedSection : null);
  function closeEditor() { setSection(null); if (search.has('section')) setSearch({}, { replace: true }); void facts.reload(); void friends.reload(); void dating.reload(); }
  const [preview, setPreview] = useState(false);
  const profile = current.account?.profile;
  const row = (title: string, detail: string, icon: string, target: NonNullable<typeof section>) => <button className="account-row" onClick={() => setSection(target)}><span className="account-row-icon"><Icon name={icon}/></span><span className="account-row-copy"><b>{title}</b><small>{detail}</small></span><Icon name="ChevronRight"/></button>;
  const searchSummary = (area: { source: string; areaLabel?: string } | undefined) => area?.source === 'temporary' ? area.areaLabel || 'Temporary search area' : area?.source === 'home' ? profile?.location_city || 'Add your home area' : 'Choose a search area';
  return (
    <div className="account-page profile-page live-profile">
      <div className="pagehead">
        <h2>{section === 'friends-preferences' ? 'Friends preferences' : section === 'dating-preferences' ? 'Dating preferences' : section ? 'Edit profile' : 'Profile'}</h2>
        <div className="row"><button className="btn light small" onClick={() => setPreview(true)}>Preview</button>{!section && <Link className="round" aria-label="Settings" to="/settings"><Icon name="Settings"/></Link>}</div>
      </div>
      {!section ? <div className="profile-overview">
        <div className="profile-summary"><Avatar name={profile?.display_name ?? ''} url={photo.url} large/><div><h3>{profile?.display_name}</h3><p>{profile?.location_city || 'Add your home area'}</p></div><button className="account-edit-text" onClick={() => setSection('basics')}>Edit</button></div>
        <p className="profile-saved-bio">{profile?.bio || 'Add a little about yourself.'}</p>
        <div className="account-group">{row('About you', 'Photo, bio, home & personal details', 'Profile', 'basics')}{row('Interests & availability', `${profile?.interests.length ?? 0} interests · ${profile?.availability.length ? [...new Set(profile.availability.map(window => weekdays[window.dow].slice(0,3)))].join(', ') : 'Add your availability'}`, 'Events', 'interests')}{row('Dating details', dating.snapshot?.profile.intent || 'Add your Dating details', 'Dating', 'dating')}</div>
        <p className="account-note">Profile details are shared. Your Friends and Dating search preferences stay separate.</p>
        <div className="account-group">{row('Friends preferences', searchSummary(friends.snapshot?.preferences?.searchArea), 'Friends', 'friends-preferences')}{row('Dating preferences', searchSummary(dating.snapshot?.search?.searchArea), 'Dating', 'dating-preferences')}</div>
      </div> : <>
        {(section === 'basics' || section === 'interests' || section === 'dating') && <div className="account-segments" role="group" aria-label="Profile sections">{(['basics', 'interests', 'dating'] as const).map((tab, i) => <button key={tab} aria-pressed={section === tab} onClick={() => setSection(tab)}>{['About you', 'Interests & time', 'Dating'][i]}</button>)}</div>}
        <div hidden={section !== 'basics' && section !== 'interests'}>
          <ResourceState loading={facts.loading} error={facts.error} reload={() => void facts.reload()}/>
          {facts.details && <ProfileDraft initial={current.account!} initialFacts={facts.details} factsResource={facts} section={section === 'interests' ? 'interests' : 'basics'} done={closeEditor}/>}
        </div>
        {section === 'friends-preferences' && <section className="account-edit-fields"><FriendsPreferencesPanel done={closeEditor}/></section>}
        {(section === 'dating' || section === 'dating-preferences') && <section className="account-edit-fields"><DatingPreferencesPanel view={section === 'dating' ? 'profile' : 'all'} done={closeEditor}/></section>}
        {(section === 'friends-preferences' || section === 'dating-preferences') && <button className="btn light" onClick={closeEditor}>Back to profile</button>}
      </>}
      {preview && <Modal title="Profile preview" close={() => setPreview(false)}><ProfilePreviewContent facts={facts.details}/></Modal>}
    </div>
  );
}

function ProfilePreviewContent({ facts }: { facts: ProfileDetails | null }) {
  const current = useCurrent(), photo = useProfilePhoto();
  const [mode, setMode] = useState<'Friends' | 'Dating'>('Friends');
  const dating = useDatingPreferences(current.session.user.id, current.session.access_token, current.busy);
  const profile = current.account?.profile, identity = dating.snapshot?.profile;
  return <>
    <div className="account-segments" role="group" aria-label="Preview mode">{(['Friends', 'Dating'] as const).map(value => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon name={value}/>{value}</button>)}</div>
    <p className="account-note">Saved profile · As seen in {mode}. Unsaved edits are not shown.</p>
    <div className="own-profile-photo"><Avatar name={profile?.display_name ?? ''} url={photo.url} large/><div><h2>{profile?.display_name}</h2><p>{profile?.location_city}</p></div></div>
    {profile?.bio && <section className="own-preview-section"><h3>About</h3><p>{profile.bio}</p></section>}
    <section className="own-preview-section"><h3>Interests</h3><div className="own-preview-interests">{profile?.interests.map(interest => <span className="chip" key={interest}>{interest}</span>)}</div></section>
    <dl className="own-profile-facts">{facts && (['education', 'occupation', 'languages'] as const).map(key => facts.facts.visibility[key] && <div key={key}><dt>{key[0].toUpperCase() + key.slice(1)}</dt><dd>{Array.isArray(facts.facts[key]) ? (facts.facts[key] as string[]).join(', ') : facts.facts[key]}</dd></div>)}
      {mode === 'Dating' && identity && <>
        {identity.visibility.gender && identity.gender && <div><dt>Gender</dt><dd>{identity.gender}</dd></div>}
        {identity.visibility.sexuality && identity.sexuality && <div><dt>Sexuality</dt><dd>{identity.sexuality}</dd></div>}
        {identity.visibility.height && identity.heightInches !== null && <div><dt>Height</dt><dd>{identity.heightInches} inches</dd></div>}
        {identity.intent && <div><dt>Looking for</dt><dd>{identity.intent}</dd></div>}
        {identity.style && <div><dt>Relationship style</dt><dd>{identity.style}</dd></div>}
      </>}
    </dl>
    {mode === 'Dating' && <ResourceState loading={dating.loading} error={dating.error} reload={() => void dating.reload()}/>}
    <p className="account-note">Private birthdate, full schedule and search preferences are never shown.</p>
  </>;
}

function ProfileDraft({ initial, initialFacts, factsResource, section, done }: {
  initial: Account;
  initialFacts: ProfileDetails;
  factsResource: ReturnType<typeof useProfileDetails>;
  section: 'basics' | 'interests';
  done: () => void;
}) {
  const current = useCurrent(), formId = useId();
  const [profile, setProfile] = useState(() => structuredClone(initial.profile!));
  const [facts, setFacts] = useState(() => structuredClone(initialFacts.facts));
  const [languages, setLanguages] = useState(initialFacts.facts.languages.join('\n'));
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const update = (value: Partial<MatchingProfile>) => setProfile(before => ({ ...before, ...value }));
  const busy = saving || current.busy || factsResource.busy;
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const parsed = SaveAccountSchema.safeParse({ ...current.account!, profile });
    const optional = ProfileFactsSchema.safeParse({ ...facts, languages: languages.split('\n').filter(Boolean) });
    if (!parsed.success || !optional.success) {
      setError(!parsed.success ? parsed.error.issues[0].message : !optional.success ? optional.error.issues[0].message : 'Check your profile.');
      return;
    }
    const factsChanged = JSON.stringify(optional.data) !== JSON.stringify(initialFacts.facts);
    if (factsChanged && !factsResource.canWrite) {
      setError('Reload optional details before saving again. Your draft is still here.');
      return;
    }
    setSaving(true);
    try {
      if (JSON.stringify(profile) !== JSON.stringify(current.account?.profile) && !await current.save(parsed.data)) return;
      if (factsChanged && !await factsResource.save({ expectedRevision: initialFacts.revision, facts: optional.data })) {
        setError('Your main profile is saved, but optional details could not be confirmed. Reload those details before trying again.');
        return;
      }
      done();
    } finally { setSaving(false); }
  }
  return <div className="profile-editor">
    <div className="account-edit-fields">
      {section === 'basics' && <PhotoEditor compact/>}
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
              <label>Languages · one per line<textarea rows={2} value={languages} onChange={event => setLanguages(event.target.value)}/></label>
              <label className="account-check"><input type="checkbox" checked={facts.visibility.languages} onChange={event => setFacts({ ...facts, visibility: { ...facts.visibility, languages: event.target.checked } })}/>Show languages</label>
            </fieldset>
            <details className="profile-account-details"><summary>Account username</summary><label>Username<input required maxLength={80} value={profile.username} onChange={event => update({ username: event.target.value })}/></label></details>
          </div>
          <div hidden={section !== 'interests'}>
            <h3 className="account-section-label">Interests <span>{profile.interests.length}/30</span></h3>
            <p className="account-note">Shared across your Profile and Friends.</p>
            <Interests compact value={profile.interests} change={interests => update({ interests })}/>
            <div className="account-divider"/>
            <h3 className="account-section-label">Weekly availability</h3>
            <p className="account-note">{profile.availability.length ? `${profile.availability.length} saved time ${profile.availability.length === 1 ? 'window' : 'windows'}` : 'Add times that usually work for you.'}</p>
            <details className="profile-availability"><summary className="account-area">Edit availability <Icon name="ChevronRight"/></summary><Availability value={profile.availability} change={availability => update({ availability })}/></details>
            <p className="account-note">Your full schedule and birthdate are never part of your public profile.</p>
          </div>
        </fieldset>
      </form>
      {section === 'interests' && <MatchingSchedule compact token={current.session.access_token} disabled={busy} onSaved={() => window.dispatchEvent(new Event('pebble:matching-changed'))}/>}
      <ErrorMessage>{error || current.error || factsResource.error}</ErrorMessage>
      {current.error && <ActionButton secondary onClick={current.reload}>Reload account before saving again</ActionButton>}
      {!factsResource.canWrite && <ActionButton secondary disabled={busy} onClick={() => { void factsResource.reload().then(saved => { if (saved) { setFacts(structuredClone(saved.facts)); setLanguages(saved.facts.languages.join('\n')); setError(''); } }); }}>Reload saved optional details to replace this draft</ActionButton>}
    </div>
    <div className="profile-save-bar"><button className="btn light" type="button" disabled={busy} onClick={done}>Cancel</button><button className="btn" form={formId} disabled={busy || !current.available}>{busy ? 'Saving…' : 'Save changes'}</button></div>
  </div>;
}
