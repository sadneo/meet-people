import { useMemo, useState, type FormEvent } from "react";
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
import { ActionButton, ErrorMessage, ResourceState } from "./common";
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
      <fieldset>
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
    </fieldset>
  );
}
const defaultBounds: Bounds = { ageMin: 18, ageMax: 99, radiusMiles: 15 };
export function FriendsPreferencesPanel({ done }: { done: () => void }) {
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
        reload={() => void resource.reload()}
      />
      {resource.snapshot && (
        <FriendsForm
          key={resource.snapshot.revision}
          initial={
            resource.snapshot.preferences ?? {
              ...defaultBounds,
              goals: [],
              searchArea: { source: "home", resolvedLocationRef: null },
            }
          }
          disabled={!resource.canWrite}
          save={async (preferences) => {
            if (
              await resource.save({
                expectedRevision: resource.snapshot!.revision,
                preferences,
              })
            )
              done();
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
}: {
  initial: FriendsPreferences;
  disabled: boolean;
  save: (value: FriendsPreferences) => Promise<void>;
}) {
  const [value, setValue] = useState(initial),
    [validation, setValidation] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.ageMin > value.ageMax) {
      setValidation("Minimum age must not exceed maximum age.");
      return;
    }
    setValidation("");
    void save(value);
  }
  return (
    <form onSubmit={submit}>
      <fieldset disabled={disabled}>
        <BoundsFields
          value={value}
          change={(bounds) => setValue({ ...value, ...bounds })}
        />
        <fieldset>
          <legend>Friendship goals</legend>
          {[
            ...new Set([
              "Hangout crew",
              "Study buddies",
              "Activity partners",
              ...value.goals,
            ]),
          ].map((goal) => (
            <label className="check-row" key={goal}>
              <input
                type="checkbox"
                checked={value.goals.includes(goal)}
                onChange={(event) =>
                  setValue({
                    ...value,
                    goals: event.target.checked
                      ? [...value.goals, goal]
                      : value.goals.filter((item) => item !== goal),
                  })
                }
              />
              {goal}
            </label>
          ))}
        </fieldset>
        <LocationPicker
          mode="friends"
          value={value.searchArea}
          change={(searchArea) => setValue({ ...value, searchArea })}
        />
        <p className="account-note">
          Interests and your usual week are shared with Profile. Friends
          matching returns one person at a time.
        </p>
        <button className="btn">Save Friends preferences</button>
      </fieldset>
      <ErrorMessage>{validation}</ErrorMessage>
    </form>
  );
}
export function DatingPreferencesPanel({ done }: { done: () => void }) {
  const current = useCurrent(),
    resource = useDatingPreferences(
      current.session.user.id,
      current.session.access_token,
      current.busy,
    );
  return (
    <>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={() => void resource.reload()}
      />
      {resource.snapshot?.profile.enabled && (
        <p>Pause Dating discovery before editing your preferences.</p>
      )}
      {resource.snapshot && (
        <DatingForm
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
            if (
              await resource.save({
                expectedProfileRevision: resource.snapshot!.profileRevision,
                expectedSearchRevision: resource.snapshot!.searchRevision,
                profile,
                search,
              })
            )
              done();
          }}
        />
      )}
    </>
  );
}
function DatingForm({
  initialProfile,
  initialSearch,
  disabled,
  save,
}: {
  initialProfile: DatingProfile;
  initialSearch: DatingSearch;
  disabled: boolean;
  save: (profile: DatingProfile, search: DatingSearch) => Promise<void>;
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
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(profile, search);
      }}
    >
      <fieldset disabled={disabled}>
        <h3>Your Dating profile</h3>
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
            <label key={key}>
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
            </label>
          );
        })}
        {establishedIdentityChanged ? (
          <p className="account-note">
            Save your identity change first, then reopen preferences to confirm
            who you’d like to meet.
          </p>
        ) : (
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
        )}
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
        <label>
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
        </fieldset>
        <BoundsFields
          value={search}
          change={(bounds) => setSearch({ ...search, ...bounds })}
        />
        <LocationPicker
          mode="dating"
          value={search.searchArea}
          change={(searchArea) => setSearch({ ...search, searchArea })}
        />
        <p className="account-note">
          Saving preferences keeps Dating paused. Start discovery separately
          when you’re ready.
        </p>
        <button className="btn">Save Dating preferences</button>
      </fieldset>
    </form>
  );
}
