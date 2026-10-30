import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link } from 'react-router';
import type { FriendsPreferences } from "../../shared/friends-search-preferences";
import {
  DatingProfileSchema,
  type DatingProfile,
  type DatingSearch,
} from "../../shared/dating";
import type { SearchLocationReceipt } from "../../shared/search-locations";
import { searchLocationClient } from "../features/matchmaking/search-location-client";
import { useFriendsPreferences } from "../features/matchmaking/useFriendsPreferences";
import { useDatingPreferences } from "../features/matchmaking/useDatingPreferences";
import { useAction } from "./hooks";
import { ActionButton, ErrorMessage, Icon, ResourceState } from "./common";
import { useCurrent } from "./current";

type SearchArea = FriendsPreferences["searchArea"];
type Bounds = Pick<FriendsPreferences, "ageMin" | "ageMax" | "radiusMiles">;
export function BoundsFields({
  value,
  change,
}: {
  value: Bounds;
  change: (value: Bounds) => void;
}) {
  return (
    <>
      <fieldset className="preference-bounds">
        <legend>Who you’d like to meet</legend>
        <div className="formgrid">
          <label>
            Minimum age
            <input
              type="number"
              min={18}
              max={99}
              required
              value={value.ageMin}
              onChange={(event) =>
                change({ ...value, ageMin: +event.target.value })
              }
            />
          </label>
          <label>
            Maximum age
            <input
              type="number"
              min={18}
              max={99}
              required
              value={value.ageMax}
              onChange={(event) =>
                change({ ...value, ageMax: +event.target.value })
              }
            />
          </label>
        </div>
      </fieldset>
      <label>
        Distance · {value.radiusMiles} miles
        <input
          type="range"
          min={1}
          max={100}
          value={value.radiusMiles}
          onChange={(event) =>
            change({ ...value, radiusMiles: +event.target.value })
          }
        />
      </label>
    </>
  );
}
export function LocationPicker({
  mode,
  value,
  change,
}: {
  mode: "friends" | "dating";
  value: SearchArea;
  change: (area: SearchArea) => void;
}) {
  const current = useCurrent(),
    client = useMemo(
      () => searchLocationClient(current.session.access_token),
      [current.session.access_token],
    ),
    action = useAction();
  const [query, setQuery] = useState(""),
    [places, setPlaces] = useState<
      { id: string; label: string; region: string }[]
    >([]),
    [label, setLabel] = useState("");
  function selected(receipt: SearchLocationReceipt) {
    setLabel(receipt.areaLabel);
    change(
      receipt.source === "home"
        ? { source: "home", resolvedLocationRef: receipt.id }
        : {
            source: "temporary",
            areaLabel: receipt.areaLabel,
            resolvedLocationRef: receipt.id,
          },
    );
    setPlaces([]);
  }
  return (
    <fieldset className="search-area">
      <legend>Search area</legend>
      <details className="search-area-editor">
      <summary className="account-area">{label || (value.source === 'home' ? current.account?.profile?.location_city || 'Choose a home area' : value.areaLabel || 'Choose an area')}<Icon name="ChevronRight"/></summary>
      <label>
        Use
        <select
          value={value.source}
          disabled={action.busy}
          onChange={(event) => {
            setLabel("");
            change(
              event.target.value === "home"
                ? { source: "home", resolvedLocationRef: null }
                : {
                    source: "temporary",
                    areaLabel:
                      current.account?.profile?.location_city ||
                      "Choose an area",
                    resolvedLocationRef: null,
                  },
            );
          }}
        >
          <option value="home">Home area</option>
          <option value="temporary">Temporary search area</option>
        </select>
      </label>
      <p className="account-note">
        {label ||
          (value.source === "home"
            ? current.account?.profile?.location_city
            : value.areaLabel)}{" "}
        ·{" "}
        {value.resolvedLocationRef
          ? "Selected area saved with these preferences"
          : "Choose a search result to confirm this area"}
      </p>
      <label>
        Find a city or campus
        <input
          value={query}
          maxLength={120}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <ActionButton
        secondary
        disabled={query.trim().length < 2 || action.busy}
        onClick={() => {
          void action.run(async () => {
            const data = await client.lookup(query.trim());
            setPlaces(data.places);
          });
        }}
      >
        Find areas
      </ActionButton>
      <div className="area-results">
        {places.map((place) => (
          <ActionButton
            key={place.id}
            secondary
            disabled={action.busy}
            onClick={() => {
              void action.run(async () =>
                selected(
                  await client.resolve({
                    requestId: crypto.randomUUID(),
                    mode,
                    source: value.source,
                    placeId: place.id,
                  }),
                ),
              );
            }}
          >
            {place.label} · {place.region}
          </ActionButton>
        ))}
      </div>
      <p className="account-note">
        Use your device location only if you want to share it for this search.
      </p>
      <ActionButton
        secondary
        disabled={action.busy || !navigator.geolocation}
        onClick={() => {
          void action.run(async () => {
            const position = await new Promise<GeolocationPosition>(
              (resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                  enableHighAccuracy: false,
                  timeout: 15000,
                  maximumAge: 0,
                }),
            );
            if (position.coords.accuracy > 1000)
              throw new Error(
                "Your location is too imprecise. Choose a city or campus instead.",
              );
            selected(
              await client.browser({
                requestId: crypto.randomUUID(),
                mode,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracyMeters: position.coords.accuracy,
                observedAt: new Date(position.timestamp).toISOString(),
                consent: true,
              }),
            );
          });
        }}
      >
        Use my current location
      </ActionButton>
      <ErrorMessage>{action.error}</ErrorMessage>
      </details>
    </fieldset>
  );
}
const defaultBounds: Bounds = { ageMin: 18, ageMax: 99, radiusMiles: 15 };
function AgeRange({ value, change, commit }: { value: Pick<Bounds, 'ageMin' | 'ageMax'>; change: (value: Pick<Bounds, 'ageMin' | 'ageMax'>) => void; commit: () => void }) {
  return <div className="friends-age-field">
    <div className="row between"><span>Age range</span><output aria-live="polite">{value.ageMin}–{value.ageMax}</output></div>
    <div className="friends-age-slider" style={{ '--age-min': `${(value.ageMin - 18) / 81 * 100}%`, '--age-max': `${(value.ageMax - 18) / 81 * 100}%` } as CSSProperties}>
      <div className="friends-age-track"/>
      {(['ageMin', 'ageMax'] as const).map(key => <input key={key} type="range" min={18} max={99} step={1} aria-label={key === 'ageMin' ? 'Minimum age' : 'Maximum age'} value={value[key]}
        onChange={event => change({ ...value, [key]: key === 'ageMin' ? Math.min(+event.target.value, value.ageMax) : Math.max(+event.target.value, value.ageMin) })}
        onPointerUp={commit} onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(); }} onBlur={commit}/>)}
    </div>
    <div className="row between friends-age-limits"><span>18</span><span>99</span></div>
  </div>;
}
export function FriendsPreferencesPanel({ done, onSavingChange }: { done: () => void; onSavingChange?: (saving: boolean) => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const current = useCurrent(),
    resource = useFriendsPreferences(
      current.session.user.id,
      current.session.access_token,
      current.busy,
    );
  return (
    <>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={() => void resource.reload().then(result => { if (result) setReloadKey(value => value + 1); })}
      />
      {resource.snapshot && (
        <FriendsForm
          key={reloadKey}
          initial={
            resource.snapshot.preferences ?? {
              ...defaultBounds,
              goals: [],
              searchArea: { source: "home", resolvedLocationRef: null },
            }
          }
          disabled={!resource.canWrite}
          saving={resource.busy}
          done={done}
          save={async (preferences) => {
            onSavingChange?.(true);
            try {
              return !!(await resource.save({
                expectedRevision: resource.snapshot!.revision,
                preferences,
              }));
            } finally { onSavingChange?.(false); }
          }}
        />
      )}
    </>
  );
}
function FriendsForm({
  initial,
  disabled,
  save,
  saving,
  done,
}: {
  initial: FriendsPreferences;
  disabled: boolean;
  save: (value: FriendsPreferences) => Promise<boolean>;
  saving: boolean;
  done: () => void;
}) {
  const current = useCurrent();
  const [value, setValue] = useState(initial),
    [validation, setValidation] = useState("");
  const latest = useRef(initial), confirmed = useRef(initial), locked = useRef(false);
  async function commit(next = latest.current) {
    if (disabled || locked.current || JSON.stringify(next) === JSON.stringify(confirmed.current)) return;
    if (!next.searchArea.resolvedLocationRef) {
      setValidation('Choose a search result to confirm your area before preferences can apply.');
      return;
    }
    locked.current = true;
    setValidation('');
    try { if (await save(next)) confirmed.current = next; }
    finally { locked.current = false; }
  }
  function change(next: FriendsPreferences, apply = false) {
    latest.current = next;
    setValue(next);
    if (apply) void commit(next);
  }
  const profile = current.account?.profile;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const availability = profile?.availability.map(window => `${days[window.dow]} ${+window.start_time.slice(0,2) < 12 ? 'mornings' : +window.start_time.slice(0,2) < 17 ? 'afternoons' : 'evenings'}`);
  const goals = [...new Set(['New friends', 'Hangout crew', 'Study buddies', 'Activity partners', ...value.goals])];
  const selectedGoal = value.goals.length > 1 ? '__multiple__' : value.goals[0] ?? '';
  return (
    <form className="friends-preferences-form" onSubmit={event => { event.preventDefault(); void commit().then(() => { if (!locked.current && JSON.stringify(latest.current) === JSON.stringify(confirmed.current)) done(); }); }}>
      <p className="account-note">Preferences apply immediately. Shared Profile edits have their own Save action.</p>
      <fieldset disabled={disabled}>
        <h3>Who you’d like to meet</h3>
        <AgeRange value={value} change={bounds => change({ ...latest.current, ...bounds })} commit={() => void commit()}/>
        <LocationPicker
          mode="friends"
          value={value.searchArea}
          change={(searchArea) => change({ ...latest.current, searchArea }, !!searchArea.resolvedLocationRef)}
        />
        <label className="friends-goal">Friendship goal
          <select value={selectedGoal} onChange={event => change({ ...latest.current, goals: event.target.value ? [event.target.value] : [] }, true)}>
            <option value="">Any friendship goal</option>
            {value.goals.length > 1 && <option value="__multiple__">{value.goals.join(' · ')}</option>}
            {goals.map(goal => <option key={goal} value={goal}>{goal}</option>)}
          </select>
        </label>
      </fieldset>
      <section className="friends-shared-interests"><h4>Interests · shared with Profile</h4><p className="account-note">{profile?.interests.join(' · ') || 'Add your interests'}</p><Link className="btn light" to="/profile?section=basics">Edit profile</Link></section>
      <section className="friends-shared-availability"><h4>Availability · shared with Profile</h4><div className="row between"><p className="account-note">{[...new Set(availability)].join(', ') || 'Add your availability'}</p><Link to="/profile?section=interests">Edit</Link></div></section>
      <ErrorMessage>{validation}</ErrorMessage>
      {saving && <p role="status" className="account-note">Saving preferences…</p>}
      <button className="btn" disabled={disabled}>Done</button>
    </form>
  );
}
export function DatingPreferencesPanel({ done, view = 'all', onSavingChange }: { done: () => void; view?: 'all' | 'profile'; onSavingChange?: (saving: boolean) => void }) {
  const [reloadKey, setReloadKey] = useState(0);
  const current = useCurrent(),
    resource = useDatingPreferences(
      current.session.user.id,
      current.session.access_token,
      current.busy,
    );
  async function savePreferences(profile: DatingProfile, search: DatingSearch) {
    if (!resource.snapshot) return false;
    onSavingChange?.(true);
    try { return !!await resource.save({ expectedProfileRevision: resource.snapshot.profileRevision, expectedSearchRevision: resource.snapshot.searchRevision, profile, search }); }
    finally { onSavingChange?.(false); }
  }
  return (
    <>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={() => void resource.reload().then(result => { if(result)setReloadKey(value => value + 1); })}
      />
      {resource.snapshot?.profile.enabled && (
        <p className="account-note">Pause Dating to edit preferences. <Link to="/matchmaking?mode=dating">Open Discover</Link></p>
      )}
      {resource.snapshot && view === 'all' && <DatingSearchForm key={reloadKey} initialProfile={resource.snapshot.profile} initialSearch={resource.snapshot.search ?? { ...defaultBounds, searchArea: { source: 'home', resolvedLocationRef: null } }} disabled={!resource.canWrite} saving={resource.busy} save={savePreferences} done={done}/>}
      {resource.snapshot && view === 'profile' && (
        <DatingForm
          view={view}
          cancel={done}
          saving={resource.phase === 'saving'}
          key={`${resource.snapshot.profileRevision}:${resource.snapshot.searchRevision}`}
          initialProfile={resource.snapshot.profile}
          initialSearch={
            resource.snapshot.search ?? {
              ...defaultBounds,
              searchArea: { source: "home", resolvedLocationRef: null },
            }
          }
          disabled={!resource.canWrite}
          save={async (profile, search) => {
            if (await savePreferences(profile, search)) done();
          }}
        />
      )}
    </>
  );
}
function DatingSearchForm({ initialProfile, initialSearch, disabled, saving, save, done }: {
  initialProfile: DatingProfile; initialSearch: DatingSearch; disabled: boolean; saving: boolean;
  save: (profile: DatingProfile, search: DatingSearch) => Promise<boolean>; done: () => void;
}) {
  const distanceId = useId();
  const [profile, setProfile] = useState(initialProfile), [search, setSearch] = useState(initialSearch), [validation, setValidation] = useState('');
  const latest = useRef({ profile: initialProfile, search: initialSearch }), confirmed = useRef({ profile: initialProfile, search: initialSearch }), locked = useRef(false);
  async function commit() {
    const next = latest.current;
    if (JSON.stringify(next) === JSON.stringify(confirmed.current)) return true;
    if (disabled || locked.current) return false;
    if (!next.search.searchArea.resolvedLocationRef) { setValidation('Choose a search result to confirm your area before preferences can apply.'); return false; }
    setValidation(''); locked.current = true;
    try { if (await save(next.profile, next.search)) { confirmed.current = next; return true; } return false; }
    finally { locked.current = false; }
  }
  function changeSearch(next: DatingSearch, apply = false) { latest.current = { ...latest.current, search: next }; setSearch(next); if (apply) void commit(); }
  const targets = profile.clarifiedTargets;
  const interested = targets.length === 3 && ['Man', 'Woman', 'Nonbinary'].every(target => targets.includes(target)) ? 'everyone' : targets.length === 1 && ['Man', 'Woman', 'Nonbinary'].includes(targets[0]) ? targets[0] : targets.length ? 'saved' : '';
  const distance = search.radiusMiles === 100 ? '100+ miles' : `${search.radiusMiles} ${search.radiusMiles === 1 ? 'mile' : 'miles'}`;
  return <form className="dating-search-form" onSubmit={event => { event.preventDefault(); void commit().then(ok => { if (ok) done(); }); }}>
    <fieldset disabled={disabled}>
      <h3>Who you’d like to meet</h3>
      <AgeRange value={search} change={bounds => changeSearch({ ...latest.current.search, ...bounds })} commit={() => void commit()}/>
      <div className="dating-distance" style={{ '--distance': `${(search.radiusMiles - 1) / 99 * 100}%` } as CSSProperties}>
        <div className="row between"><label htmlFor={distanceId}>Distance</label><output>{distance}</output></div>
        <input id={distanceId} type="range" min={1} max={100} value={search.radiusMiles} aria-valuetext={distance}
          onChange={event => changeSearch({ ...latest.current.search, radiusMiles: +event.target.value })} onPointerUp={() => void commit()} onBlur={() => void commit()}
          onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) void commit(); }}/>
        <div className="row between dating-distance-limits"><span>1 mile</span><span>100+ miles</span></div>
      </div>
      <LocationPicker mode="dating" value={search.searchArea} change={searchArea => changeSearch({ ...latest.current.search, searchArea }, !!searchArea.resolvedLocationRef)}/>
      <label className="dating-interested">Interested in
        <select value={interested} disabled={!profile.gender || !profile.sexuality} onChange={event => {
          const next = { ...latest.current.profile, clarifiedTargets: event.target.value === 'everyone' ? ['Man', 'Woman', 'Nonbinary'] : [event.target.value] };
          latest.current = { ...latest.current, profile: next }; setProfile(next); void commit();
        }}>
          <option value="" disabled>Choose who you’d like to meet</option>
          <option value="everyone">Everyone</option><option value="Man">Men</option><option value="Woman">Women</option><option value="Nonbinary">Nonbinary people</option>
          {interested === 'saved' && <option value="saved">{targets.join(' · ')}</option>}
        </select>
      </label>
    </fieldset>
    {(!profile.gender || !profile.sexuality) && <p className="account-note">Add your Dating identity in Edit profile before choosing who you’d like to meet.</p>}
    <p className="account-note">Preferences apply immediately. Dating participation stays unchanged.</p>
    <ErrorMessage>{validation}</ErrorMessage>
    {saving && <p className="account-note" role="status">Saving preferences…</p>}
    <section className="dating-preference-summary"><h3>Your Dating profile</h3><dl>
      <div><dt>Your intention</dt><dd>{profile.intent || 'Not set'}</dd></div><div><dt>Relationship style</dt><dd>{profile.style || 'Not set'}</dd></div>
    </dl><Link to="/profile?section=dating">Edit profile details <Icon name="ChevronRight"/></Link></section>
    <button className="btn" disabled={saving}>Done</button>
  </form>;
}
function DatingForm({
  initialProfile,
  initialSearch,
  disabled,
  save,
  view = 'all',
  cancel,
  saving = false,
}: {
  initialProfile: DatingProfile;
  initialSearch: DatingSearch;
  disabled: boolean;
  save: (profile: DatingProfile, search: DatingSearch) => Promise<void>;
  view?: 'all' | 'profile';
  cancel?: () => void;
  saving?: boolean;
}) {
  const [profile, setProfile] = useState(initialProfile),
    [search, setSearch] = useState(initialSearch);
  const establishedIdentityChanged =
    !!(initialProfile.gender || initialProfile.sexuality) &&
    (profile.gender !== initialProfile.gender ||
      profile.sexuality !== initialProfile.sexuality);
  function identity(key: "gender" | "sexuality", value: string) {
    setProfile({ ...profile, [key]: value, clarifiedTargets: [] });
  }
  return (
    <form className={view === 'profile' ? 'profile-editor' : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void save(profile, search);
      }}
    >
      <fieldset disabled={disabled}>
        {view === 'profile' ? <p className="account-note">These describe you. Who you want to meet is set in Dating preferences.</p> : <h3>Your Dating profile</h3>}
        {(["gender", "sexuality"] as const).map((key) => {
          const options =
            key === "gender"
              ? ["Man", "Woman", "Nonbinary", "Other", "Prefer not to say"]
              : [
                  "Straight",
                  "Gay",
                  "Lesbian",
                  "Bisexual",
                  "Pansexual",
                  "Asexual",
                  "Queer",
                  "Other",
                  "Prefer not to say",
                ];
          return (
            <div key={key}><label>
              {key === "gender" ? "Gender" : "Sexuality"}
              <select
                value={profile[key]}
                onChange={(event) => identity(key, event.target.value)}
              >
                <option value="">Choose</option>
                {[
                  ...new Set([
                    ...options,
                    ...(profile[key] ? [profile[key]] : []),
                  ]),
                ].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>{view === 'profile' && <label className="account-check"><input type="checkbox" checked={profile.visibility[key]} onChange={event => setProfile({ ...profile, visibility: { ...profile.visibility, [key]: event.target.checked } })}/>Show {key} in Dating</label>}</div>
          );
        })}
        {establishedIdentityChanged ? (
          <p className="account-note">
            Save your identity change first, then reopen preferences to confirm
            who you’d like to meet.
          </p>
        ) : view === 'all' ? (
          <fieldset
            disabled={!profile.gender || !profile.sexuality}
          >
            <legend>Who would you like to meet?</legend>
            {[
              "Man",
              "Woman",
              "Nonbinary",
              ...profile.clarifiedTargets.filter(
                (item) => !["Man", "Woman", "Nonbinary"].includes(item),
              ),
            ].map((target) => (
              <label className="check-row" key={target}>
                <input
                  type="checkbox"
                  checked={profile.clarifiedTargets.includes(target)}
                  onChange={(event) =>
                    setProfile({
                      ...profile,
                      clarifiedTargets: event.target.checked
                        ? [...profile.clarifiedTargets, target]
                        : profile.clarifiedTargets.filter(
                            (item) => item !== target,
                          ),
                    })
                  }
                />
                {target}
              </label>
            ))}
          </fieldset>
        ) : null}
        {view === 'profile' && <><label>Height · inches (optional)<input type="number" min={24} max={107} value={profile.heightInches ?? ''} onChange={event => setProfile({ ...profile, heightInches: event.target.value ? +event.target.value : null })}/></label><label className="account-check"><input type="checkbox" checked={profile.visibility.height} onChange={event => setProfile({ ...profile, visibility: { ...profile.visibility, height: event.target.checked } })}/>Show height in Dating</label></>}
        <label>
          Looking for
          <select
            value={profile.intent}
            onChange={(event) =>
              setProfile({
                ...profile,
                intent: event.target.value as DatingProfile["intent"],
              })
            }
          >
            {DatingProfileSchema.shape.intent.options.map((option) => (
              <option key={option} value={option}>
                {option || "Choose an intention"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Relationship style
          <select
            value={profile.style}
            onChange={(event) =>
              setProfile({
                ...profile,
                style: event.target.value as DatingProfile["style"],
              })
            }
          >
            {DatingProfileSchema.shape.style.options.map((option) => (
              <option key={option} value={option}>
                {option || "Choose a style"}
              </option>
            ))}
          </select>
        </label>
        {view === 'all' && <><label>
          Height · inches (optional)
          <input
            type="number"
            min={24}
            max={107}
            value={profile.heightInches ?? ""}
            onChange={(event) =>
              setProfile({
                ...profile,
                heightInches: event.target.value ? +event.target.value : null,
              })
            }
          />
        </label>
        <fieldset>
          <legend>Show on your profile</legend>
          {(["gender", "sexuality", "height"] as const).map((key) => (
            <label className="check-row" key={key}>
              <input
                type="checkbox"
                checked={profile.visibility[key]}
                onChange={(event) =>
                  setProfile({
                    ...profile,
                    visibility: {
                      ...profile.visibility,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {key}
            </label>
          ))}
        </fieldset></>}
        {view === 'all' && <><BoundsFields
          value={search}
          change={(bounds) => setSearch({ ...search, ...bounds })}
        />
        <LocationPicker
          mode="dating"
          value={search.searchArea}
          change={(searchArea) => setSearch({ ...search, searchArea })}
        /></>}
        <p className="account-note">
          Saving preferences keeps Dating paused. Start discovery separately
          when you’re ready.
        </p>
        {view === 'all' && <button className="btn">Save Dating preferences</button>}
      </fieldset>
      {view === 'profile' && <div className="profile-save-bar"><button type="button" className="btn light" disabled={saving} onClick={cancel}>Cancel</button><button className="btn" disabled={disabled}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
    </form>
  );
}
