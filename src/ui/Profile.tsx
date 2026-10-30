import { MatchingSchedule } from './MatchingSchedule';
import { DatingPreferencesPanel } from './Preferences';
import { useId, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import {
  completedAccountChapters,
  SaveAccountSchema,
  type Account,
} from "../../shared/account";
import { AvailabilitySchema, type MatchingProfile } from "../../shared/matchmaking";
import type { ProfileDetails } from "../../shared/profile-details";
import { ProfileFactsSchema } from '../../shared/profile-details';
import { safeReturnTo } from "../auth/returnTo";
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
  Brand,
  ErrorMessage,
  ResourceState,
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
      <legend className={compact ? 'sr-only' : undefined}>Interests · choose at least three from the provided list</legend>
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
  const [source, setSource] = useState(initial),
    [draft, setDraft] = useState<Account>(() => structuredClone(initial)),
    [validation, setValidation] = useState(""),
    [saved, setSaved] = useState(false);
  // Failed writes retain the same source and the user's draft. Confirmed
  // saves or explicit reloads replace it with the authoritative account.
  if (source !== initial) {
    setSource(initial);
    setDraft(structuredClone(initial));
    setValidation("");
  }
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
          Reload account and replace draft before saving again
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
          disabled={action.busy}
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
  const [search, setSearch] = useSearchParams();
  const requestedSection = search.get('section');
  const [section, setSection] = useState<'basics' | 'interests' | 'dating' | null>(() => requestedSection === 'basics' || requestedSection === 'interests' || requestedSection === 'dating' ? requestedSection : null);
  function closeEditor() { setSection(null); if(search.has('section'))setSearch({}, {replace:true}); void facts.reload(); }
  const profile = current.account?.profile;
  const settingsCategory = settingsCategories.find(category => category[0] === requestedSection);
  if (settingsCategory)
    return <ProfileSettings key={settingsCategory[0]} section={settingsCategory[0]}/>;
  if (requestedSection === 'friends-preferences' || requestedSection === 'dating-preferences')
    return <Navigate replace to={`/matchmaking?mode=${requestedSection === 'dating-preferences' ? 'dating' : 'friends'}&preferences=true`}/>;
  return (
    <div className="account-page profile-page live-profile">
      <div className="pagehead">
        <h2>{section ? 'Edit profile' : 'Profile'}</h2>
      </div>
      {!section ? <div className="profile-overview">
        <div className="profile-summary"><Avatar name={profile?.display_name ?? ''} url={photo.url} large/><div><h3>{profile?.display_name}</h3><p>{profile?.location_city || 'Add your home area'}</p></div></div>
        <p className="profile-saved-bio">{profile?.bio || 'Add a little about yourself.'}</p>
        <div className="account-group"><button className="account-row" aria-label="Edit profile" onClick={() => setSection('basics')}><span className="account-row-icon"><Icon name="Profile"/></span><span className="account-row-copy"><b>Edit profile</b><small>About you, interests, availability & Dating details</small></span><Icon name="ChevronRight"/></button></div>
        <ProfileSettingsLinks/>
        <Link className="account-logout" to="/logout">Sign out of Pebble</Link>
      </div> : <>
        {(section === 'basics' || section === 'interests' || section === 'dating') && <div className="account-segments" role="group" aria-label="Profile sections">{(['basics', 'interests', 'dating'] as const).map((tab, i) => <button key={tab} aria-pressed={section === tab} onClick={() => setSection(tab)}>{['About You', 'Interests & Availability', 'Dating Profile'][i]}</button>)}</div>}
        <div hidden={section !== 'basics' && section !== 'interests'}>
          <ResourceState loading={facts.loading} error={facts.error} reload={() => void facts.reload()}/>
          {facts.details && <ProfileDraft initial={current.account!} initialFacts={facts.details} factsResource={facts} section={section === 'interests' ? 'interests' : 'basics'} done={closeEditor}/>}
        </div>
        {section === 'dating' && <section className="account-edit-fields"><DatingPreferencesPanel view="profile" done={closeEditor}/></section>}
      </>}
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
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    const parsed = SaveAccountSchema.safeParse({ ...current.account!, profile });
    const optional = ProfileFactsSchema.safeParse(facts);
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
