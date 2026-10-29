import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  completedAccountChapters,
  SaveAccountSchema,
  type Account,
} from "../../shared/account";
import type { MatchingProfile } from "../../shared/matchmaking";
import type { ProfileDetails } from "../../shared/profile-details";
import { safeReturnTo } from "../auth/returnTo";
import { globalInterestChoices } from "../features/account/global-interests";
import { useProfileDetails } from "../features/account/useProfileDetails";
import {
  photoChangedEvent,
  useProfilePhoto,
} from "../features/account/useProfilePhoto";
import { useAction } from "./hooks";
import {
  ActionButton,
  Avatar,
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
}: {
  value: string[];
  change: (value: string[]) => void;
}) {
  const [custom, setCustom] = useState("");
  return (
    <fieldset>
      <legend>Interests · choose at least three</legend>
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
          Custom interest
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
export function PhotoEditor() {
  const photo = useProfilePhoto(),
    current = useCurrent(),
    action = useAction(),
    [reconcile, setReconcile] = useState(false);
  const [file, setFile] = useState<File | null>(null);
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
    <section className="account-panel">
      <h3>Your photo</h3>
      <Avatar
        name={current.account?.profile?.display_name ?? ""}
        url={photo.url}
        large
      />
      <ResourceState
        loading={photo.loading}
        error={photo.error}
        reload={photo.reload}
      />
      <label>
        Choose a photo
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={action.busy}
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      <ErrorMessage>{action.error}</ErrorMessage>
      <div className="row wrap">
        <ActionButton
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
        </ActionButton>
        <ActionButton
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
        </ActionButton>
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
function FactsEditor({
  initial,
  save,
  disabled,
}: {
  initial: ProfileDetails;
  save: (value: ProfileDetails["facts"]) => Promise<boolean>;
  disabled: boolean;
}) {
  const [languages, setLanguages] = useState(
    initial.facts.languages.join("\n"),
  );
  const [facts, setFacts] = useState(initial.facts),
    [notice, setNotice] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save({
          ...facts,
          languages: languages.split("\n").filter(Boolean),
        }).then((ok) => setNotice(ok ? "Details saved." : ""));
      }}
    >
      <fieldset disabled={disabled}>
        {(["education", "occupation"] as const).map((key) => (
          <label key={key}>
            {key === "education" ? "Education" : "Occupation"}
            <input
              maxLength={120}
              value={facts[key]}
              onChange={(event) =>
                setFacts({ ...facts, [key]: event.target.value })
              }
            />
          </label>
        ))}
        <label>
          Languages · one per line
          <textarea
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
          />
        </label>
        <fieldset>
          <legend>Visible profile facts</legend>
          {(["education", "occupation", "languages"] as const).map((key) => (
            <label className="check-row" key={key}>
              <input
                type="checkbox"
                checked={facts.visibility[key]}
                onChange={(event) =>
                  setFacts({
                    ...facts,
                    visibility: {
                      ...facts.visibility,
                      [key]: event.target.checked,
                    },
                  })
                }
              />
              {key}
            </label>
          ))}
        </fieldset>
        <button className="btn">Save details</button>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
export function Profile() {
  const current = useCurrent(),
    facts = useProfileDetails(
      current.session.user.id,
      current.session.access_token,
    );
  return (
    <div className="account-page">
      <div className="pagehead">
        <h2>Your profile</h2>
        <Link className="btn light" to="/settings">
          Settings
        </Link>
      </div>
      <div className="profile-layout">
        <section className="card">
          <AccountForm initial={current.account!} />
        </section>
        <div>
          <PhotoEditor />
          <section className="account-panel">
            <h3>A little more about you</h3>
            <ResourceState
              loading={facts.loading}
              error={facts.error}
              reload={() => void facts.reload()}
            />
            {facts.details && (
              <FactsEditor
                key={facts.details.revision}
                initial={facts.details}
                disabled={!facts.canWrite || current.busy}
                save={(value) =>
                  facts.save({
                    expectedRevision: facts.details!.revision,
                    facts: value,
                  })
                }
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
