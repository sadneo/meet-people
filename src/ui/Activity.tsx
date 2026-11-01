import { useCallback, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { respondToConnectionRequest } from "./request-actions";
import { connections } from "../features/connections/client";
import { matchmakingClient } from "../features/matchmaking/client";
import { useAction } from "./hooks";
import { useCachedLoad } from '../data/useCachedLoad';
import {
  ActionButton,
  PersonPhoto,
  Empty,
  ErrorMessage,
  ResourceState,
  Icon,
} from "./common";
import { useCurrent } from "./current";
import { SafetyActions } from "./Safety";

export function Activity() {
  const matches = useLocation().pathname === '/matches';
  const [tab, setTab] = useState('Upcoming');
  const current = useCurrent(),
    client = useMemo(
      () => matchmakingClient(current.session.access_token),
      [current.session.access_token],
    );
  const people = useCachedLoad(useCallback((signal) => connections.list(signal), []), ['connections'], 0),
    updates = useCachedLoad(useCallback(() => client.notifications(), [client]), ['notifications'], 0),
    action = useAction();
  const [uncertain, setUncertain] = useState(false);
  return (
    <div className={`activity-page ${matches ? 'plans-page' : ''}`}>
      {matches && <><Link className="account-back" to="/matchmaking"><Icon name="Back"/>Discover</Link><div className="eyebrow">Matches &amp; Plans</div></>}
      <div className="pagehead">
        <h2>{matches ? 'From a hello to a “see you there.”' : 'Your little updates.'}</h2>
        <ActionButton
          secondary
          disabled={action.busy || people.loading || updates.loading}
          onClick={() => {
            void action.run(async () => {
              if (uncertain) {
                await connections.list();
                setUncertain(false);
              }
              people.reload();
              updates.reload();
            });
          }}
        >
          Refresh
        </ActionButton>
      </div>
      {matches && <div className="tabs" role="group" aria-label="Matches and plans view">{['Upcoming', 'Connections', 'Past'].map(name => <button key={name} type="button" aria-pressed={tab === name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>{name}</button>)}</div>}
      <ErrorMessage>{action.error}</ErrorMessage>
      {uncertain && !action.busy && <p role="status">The request response is unconfirmed. Refresh before another change.</p>}
            <section className="card" id="requests" hidden={matches && tab !== 'Connections'}>
        <h3>Connection requests</h3>
        <ResourceState
          loading={people.loading}
          error={people.error}
          reload={people.reload}
        />
        {people.value && !people.value.incoming.length && (
          <p>No pending requests.</p>
        )}
        {people.value?.incoming.map((person) => (
          <div className="row between item" key={person.id}>
            <div className="row">
              <PersonPhoto id={person.id} name={person.display_name} fallback={person.avatar_url} />
              <b>{person.display_name}</b>
            </div>
            <div className="row wrap">
              <ActionButton
                disabled={action.busy || uncertain || people.refreshing}
                onClick={() => {
                  void action.run(async () => {
                    try {
                      setUncertain(true);
                      await respondToConnectionRequest(current.session.access_token, person, true);
                      setUncertain(false);
                      window.dispatchEvent(new Event("pebble:matching-changed"));
                    } finally {
                      people.reload();
                      window.dispatchEvent(
                        new Event("pebble:activity-changed"),
                      );
                    }
                  });
                }}
              >
                Accept
              </ActionButton>
              <ActionButton
                secondary
                disabled={action.busy || uncertain || people.refreshing}
                onClick={() => {
                  void action.run(async () => {
                    try {
                      setUncertain(true);
                      await respondToConnectionRequest(current.session.access_token, person, false);
                      setUncertain(false);
                      window.dispatchEvent(new Event("pebble:matching-changed"));
                    } finally {
                      people.reload();
                      window.dispatchEvent(new Event("pebble:activity-changed"));
                    }
                  });
                }}
              >
                Decline
              </ActionButton>
              <SafetyActions id={person.id} name={person.display_name} />
            </div>
          </div>
        ))}
      </section>
      <section className="card section" hidden={matches && tab !== 'Connections'}>
        <h3>Your connections</h3>
        <ResourceState loading={people.loading} error={people.error} reload={people.reload}/>
        {people.value && !people.value.connected.length && (
          <p>Find your first connection in Discover.</p>
        )}
        {people.value?.connected.map((person) => (
          <div className="row between item" key={person.id}>
            <div className="row">
              <PersonPhoto id={person.id} name={person.display_name} fallback={person.avatar_url} />
              <b>{person.display_name}</b>
            </div>
            {person.conversationId && (
              <Link
                className="btn light"
                to={`/messages/chat?conversation=${encodeURIComponent(person.conversationId)}`}
              >
                Message
              </Link>
            )}
          </div>
        ))}
      </section>
      <section className="card section" hidden={matches && tab !== 'Upcoming'}>
        <h3>Suggested event groups</h3>
        <ResourceState
          loading={updates.loading}
          error={updates.error}
          reload={updates.reload}
        />
        {updates.value && !updates.value.notifications.length && (
          <Empty title="No suggested groups yet." />
        )}
        {updates.value?.notifications.map((item) => (
          <div className="item" key={item.id}>
            <h3>Suggested group ready</h3>
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString()}
            </time>
            <div className="row wrap">
              <Link className="btn light" to={`/events/${item.eventId}`}>
                View suggested group
              </Link>
              {!item.readAt && (
                <ActionButton
                  secondary
                  disabled={action.busy}
                  onClick={() => {
                    void action.run(async () => {
                      try {
                        await client.notificationRead(item.id);
                      } finally {
                        updates.reload();
                      }
                    });
                  }}
                >
                  Mark as read
                </ActionButton>
              )}
            </div>
          </div>
        ))}
      </section>
      {matches && tab === 'Past' && <section className="card plans-empty"><Icon name="Events"/><h3>Past plans</h3><p>Past-plan history isn’t available yet.</p><Link className="btn light" to="/events">Explore events</Link></section>}
    </div>
  );
}
