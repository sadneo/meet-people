import { useCallback, useState } from "react";
import { Link } from "react-router";
import type { DatingCandidate } from "../../shared/dating-live";
import { friendsRuntime } from "../features/matchmaking/friends-runtime-client";
import { useMatchmaking } from "../features/matchmaking/useMatchmaking";
import { datingLiveClient } from "../features/matchmaking/dating-live-client";
import { connections } from "../features/connections/client";
import { useAction, useLoad } from "./hooks";
import {
  ActionButton,
  Empty,
  ErrorMessage,
  Icon,
  Modal,
  PersonPhoto,
  ResourceState,
} from "./common";
import { useCurrent } from "./current";
import { DatingPreferencesPanel, FriendsPreferencesPanel } from "./Preferences";
import { SafetyActions } from "./Safety";

export function Connect({
  id,
  dating = false,
}: {
  id: string;
  dating?: boolean;
}) {
  const current = useCurrent(),
    action = useAction(),
    state = useLoad(
      useCallback((signal) => connections.state(id, signal), [id]),
    );
  const value = state.value;
  return (
    <div className="connect-actions">
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {value?.status === "connected" && value.conversationId ? (
        <Link
          className="btn"
          to={`/messages/chat?conversation=${encodeURIComponent(value.conversationId)}`}
        >
          Message
        </Link>
      ) : value?.status === "sent" ? (
        <p role="status">Connection request sent</p>
      ) : (
        value && (
          <ActionButton
            disabled={action.busy}
            onClick={() => {
              void action.run(async () => {
                try {
                  if (value.status === "incoming") await connections.accept(id);
                  else if (dating)
                    await datingLiveClient(
                      current.session.access_token,
                    ).connect(id);
                  else await connections.request(id);
                } finally {
                  state.reload();
                }
              });
            }}
          >
            {value.status === "incoming"
              ? "Accept request"
              : dating
                ? "Send Dating request"
                : "Connect"}
          </ActionButton>
        )
      )}
    </div>
  );
}
function Candidate({
  id,
  name,
  avatar,
  interests,
  age,
  bio,
  city,
  photoRevision,
  dating = false,
}: {
  id: string;
  name: string;
  avatar: string | null;
  interests: string[];
  age?: number;
  bio?: string | null;
  city?: string | null;
  photoRevision?: number;
  dating?: boolean;
}) {
  return (
    <article className="live-candidate card">
      <div className="candidate-portrait">
        <PersonPhoto
          id={id}
          name={name}
          revision={photoRevision}
          fallback={avatar}
          large
        />
      </div>
      <div className="candidate-body">
        <h2>
          {name}
          {age !== undefined ? `, ${age}` : ""}
        </h2>
        {city && <p className="muted">{city}</p>}
        {bio && <p>{bio}</p>}
        <div>
          {interests.map((interest) => (
            <span key={interest} className="chip">
              {interest}
            </span>
          ))}
        </div>
        <Connect id={id} dating={dating} />
        <SafetyActions id={id} name={name} />
      </div>
    </article>
  );
}
function Friends({ token, preferences }: { token: string; preferences: () => void }) {
  const matching = useMatchmaking(token),
    runtime = useLoad(
      useCallback((signal) => friendsRuntime(token, signal), [token]),
    );
  const [needsSetup, setNeedsSetup] = useState(false);
  const candidate = matching.result?.candidate;
  const disabled =
    matching.busy ||
    matching.checking ||
    !!matching.searchStage ||
    !matching.known;
  return (
    <>
      <ResourceState
        loading={runtime.loading}
        error={runtime.error}
        reload={runtime.reload}
      />
      <ErrorMessage>{matching.error || matching.profileError}</ErrorMessage>
      {needsSetup && (
        <Modal title="Get ready to find friends" close={() => setNeedsSetup(false)}>
          <p>
            Friends needs discovery enabled, a complete profile, and a confirmed
            search area. Review these choices before starting your search.
          </p>
          <p>
            In Settings, turn on Discovery and Friends discovery, then save both
            sets of preferences.
          </p>
          <div className="row wrap">
            <Link className="btn" to="/settings">Review discovery settings</Link>
            <ActionButton secondary onClick={() => {
              setNeedsSetup(false);
              preferences();
            }}>
              Review search area
            </ActionButton>
            <Link className="text-link" to="/profile">Check your profile</Link>
          </div>
        </Modal>
      )}
      {matching.confirmReplacement && (
        <Modal
          title="Replace downtime matching?"
          close={matching.cancelReplacement}
        >
          <p>
            Starting an active search turns downtime matching off. It won’t
            resume automatically.
          </p>
          <ActionButton
            disabled={!!matching.searchStage}
            onClick={() => void matching.confirmSearch()}
          >
            Start active search
          </ActionButton>
          <ActionButton secondary onClick={matching.cancelReplacement}>
            Cancel
          </ActionButton>
        </Modal>
      )}
      {candidate ? (
        <Candidate {...candidate} />
      ) : (
        <div className="friends-waiting">
          <img src="/pebble/pebble.png" className="matching-pebble" alt="" />
          <h2>
            {matching.mode === "active"
              ? "Your next hello is out there."
              : "Find your kind of people."}
          </h2>
          <p className="muted">
            {matching.mode === "active"
              ? "Check when you’re ready. Friends matching finds one person at a time."
              : matching.mode === "downtime"
                ? "Downtime matching is on. Start an active search to replace it."
                : "Shared interests. A little free time. A new friend."}
          </p>
          {matching.result && !candidate && (
            <p role="status">No match yet. You can check again later.</p>
          )}
        </div>
      )}
      <div className="match-actions">
        {matching.mode === "active" ? (
          <>
            <ActionButton
              disabled={disabled}
              onClick={() => void matching.check()}
            >
              {matching.checking ? "Checking…" : "Check for a match"}
            </ActionButton>
            <ActionButton
              secondary
              disabled={disabled}
              onClick={() => void matching.queue("leave")}
            >
              Cancel search
            </ActionButton>
          </>
        ) : (
          <ActionButton
            disabled={disabled || !matching.canJoin || runtime.loading || !!runtime.error || !runtime.value}
            onClick={() => {
              if (!runtime.value?.canJoin) setNeedsSetup(true);
              else void matching.findFriends();
            }}
          >
            {matching.searchStage ? "Starting search…" : "Find Friends"}
          </ActionButton>
        )}
        <ActionButton
          secondary
          disabled={
            matching.busy || matching.profileLoading || !!matching.searchStage
          }
          onClick={() => {
            void matching.queue("refresh");
            void matching.reloadProfile();
            runtime.reload();
          }}
        >
          Refresh search status
        </ActionButton>
      </div>
      {runtime.value &&
        !runtime.value.canJoin &&
        matching.mode !== "active" && (
          <p className="account-note">
            Save your profile, enable Friends discovery in Settings, and confirm
            a search area in preferences before searching.
          </p>
        )}
    </>
  );
}
function Dating({ token }: { token: string }) {
  const runtime = useLoad(
      useCallback((signal) => datingLiveClient(token).status(signal), [token]),
    ),
    action = useAction();
  const [excluded, setExcluded] = useState<string[]>([]),
    [candidate, setCandidate] = useState<{
      candidate: DatingCandidate | null;
    } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const value = runtime.value;
  async function enable(enabled: boolean) {
    await action.run(async () => {
      if (!value || uncertain) return;
      setUncertain(true);
      setCandidate(null);
      try {
        await datingLiveClient(token).enable({
          expectedProfileRevision: value.aggregate.profileRevision,
          expectedSearchRevision: value.aggregate.searchRevision,
          enabled,
        });
        setUncertain(false);
      } finally {
        runtime.reload();
      }
    });
  }
  async function next(skip = false) {
    await action.run(async () => {
      const ids =
        skip && candidate?.candidate
          ? [...excluded, candidate.candidate.id]
          : excluded;
      if (ids.length > 50) return;
      setCandidate(null);
      const response = await datingLiveClient(token).candidate(ids);
      setExcluded(ids);
      setCandidate(response);
    });
  }
  return (
    <>
      <ResourceState
        loading={runtime.loading}
        error={runtime.error}
        reload={runtime.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {candidate?.candidate && value?.aggregate.effectiveEnabled ? (
        <Candidate
          {...candidate.candidate}
          photoRevision={candidate.candidate.photoRevision}
          dating
        />
      ) : (
        <div className="friends-waiting">
          <Icon name="Dating" />
          <h2>
            {value?.aggregate.profile.enabled
              ? "A little chemistry starts here."
              : "Dating, at your pace."}
          </h2>
          <p className="muted">
            {candidate
              ? "You’re all caught up. Check again later."
              : "Complete your Dating preferences, then choose when to be discovered."}
          </p>
        </div>
      )}
      <div className="match-actions">
        {value && !value.aggregate.profile.enabled ? (
          <ActionButton
            disabled={action.busy || uncertain || !value.canStart}
            onClick={() => void enable(true)}
          >
            Start Dating discovery
          </ActionButton>
        ) : (
          value && (
            <>
              <ActionButton
                disabled={action.busy || !value.aggregate.effectiveEnabled}
                onClick={() => void next(!!candidate?.candidate)}
              >
                {candidate?.candidate ? "Pass and see next" : "Find a date"}
              </ActionButton>
              <ActionButton
                secondary
                disabled={action.busy || uncertain}
                onClick={() => void enable(false)}
              >
                Pause Dating
              </ActionButton>
            </>
          )
        )}
        <ActionButton
          secondary
          disabled={action.busy}
          onClick={() => {
            setUncertain(false);
            setCandidate(null);
            runtime.reload();
          }}
        >
          Refresh Dating status
        </ActionButton>
      </div>
      {value && (!value.globalDiscovery || !value.datingDiscovery) && (
        <p className="account-note">
          Enable discovery and Dating discovery in{" "}
          <Link to="/settings">Settings</Link>.
        </p>
      )}
      {value?.aggregate.profile.enabled &&
        !value.aggregate.effectiveEnabled && (
          <p className="account-note">
            Dating is paused by your current eligibility or search area. Pause
            Dating, update your preferences, and start again.
          </p>
        )}
      {excluded.length >= 50 && <Empty title="You’re all caught up." />}
    </>
  );
}
export function Discover() {
  const current = useCurrent(),
    [mode, setMode] = useState<"Friends" | "Dating">("Friends"),
    [preferences, setPreferences] = useState(false),
    [epoch, setEpoch] = useState(0);
  return (
    <div className="discovery-page">
      <div className="discoverhead">
        <h2>Discover</h2>
        <button className="area-link" onClick={() => setPreferences(true)}>
          ⌖ Search area & preferences
        </button>
      </div>
      <div className="discovertools">
        <div className="mode-toggle" role="group" aria-label="Matchmaking mode">
          <span
            className={`mode-toggle-indicator ${mode === "Dating" ? "dating" : ""}`}
            aria-hidden="true"
          />
          {(["Friends", "Dating"] as const).map((item) => (
            <button
              key={item}
              className={mode === item ? "selected" : ""}
              aria-pressed={mode === item}
              onClick={() => setMode(item)}
            >
              <Icon name={item} />
              {item}
            </button>
          ))}
        </div>
        <button
          className="round"
          aria-label={`${mode} preferences`}
          onClick={() => setPreferences(true)}
        >
          <Icon name="preferences" />
        </button>
      </div>
      {mode === "Friends" ? (
        <Friends
          key={`friends:${epoch}`}
          token={current.session.access_token}
          preferences={() => setPreferences(true)}
        />
      ) : (
        <Dating key={`dating:${epoch}`} token={current.session.access_token} />
      )}
      {preferences && (
        <Modal
          title={`${mode} preferences`}
          close={() => setPreferences(false)}
        >
          {mode === "Friends" ? (
            <FriendsPreferencesPanel
              done={() => {
                setPreferences(false);
                setEpoch((value) => value + 1);
              }}
            />
          ) : (
            <DatingPreferencesPanel
              done={() => {
                setPreferences(false);
                setEpoch((value) => value + 1);
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}
