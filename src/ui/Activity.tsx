import { useCallback, useMemo } from "react";
import { Link } from "react-router";
import { matchingClient } from "./matching-client";
import { connections } from "../features/connections/client";
import { matchmakingClient } from "../features/matchmaking/client";
import { useAction, useLoad } from "./hooks";
import {
  ActionButton,
  Avatar,
  Empty,
  ErrorMessage,
  ResourceState,
} from "./common";
import { useCurrent } from "./current";
import { SafetyActions } from "./Safety";

export function Activity() {
  const current = useCurrent(),
    client = useMemo(
      () => matchmakingClient(current.session.access_token),
      [current.session.access_token],
    );
  const people = useLoad(useCallback((signal) => connections.list(signal), [])),
    updates = useLoad(useCallback(() => client.notifications(), [client])),
    action = useAction();
  return (
    <div className="activity-page">
      <div className="pagehead">
        <h2>Your little updates.</h2>
        <ActionButton
          secondary
          disabled={people.loading || updates.loading}
          onClick={() => {
            people.reload();
            updates.reload();
          }}
        >
          Refresh
        </ActionButton>
      </div>
      <ErrorMessage>{action.error}</ErrorMessage>
      <section className="card">
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
              <Avatar name={person.display_name} url={person.avatar_url} />
              <b>{person.display_name}</b>
            </div>
            <div className="row wrap">
              <ActionButton
                disabled={action.busy}
                onClick={() => {
                  void action.run(async () => {
                    try {
                      await matchingClient(current.session.access_token).acceptFriend(person.id);
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
                disabled={action.busy}
                onClick={() => {
                  void action.run(async () => {
                    try {
                      await connections.remove(person.id);
                    } finally {
                      people.reload();
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
      <section className="card section">
        <h3>Your connections</h3>
        {people.value && !people.value.connected.length && (
          <p>Find your first connection in Discover.</p>
        )}
        {people.value?.connected.map((person) => (
          <div className="row between item" key={person.id}>
            <div className="row">
              <Avatar name={person.display_name} url={person.avatar_url} />
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
      <section className="card section">
        <h3>Event group proposals</h3>
        <ResourceState
          loading={updates.loading}
          error={updates.error}
          reload={updates.reload}
        />
        {updates.value && !updates.value.notifications.length && (
          <Empty title="No new proposals yet." />
        )}
        {updates.value?.notifications.map((item) => (
          <div className="item" key={item.id}>
            <h3>{item.title}</h3>
            <time dateTime={item.createdAt}>
              {new Date(item.createdAt).toLocaleString()}
            </time>
            <div className="row wrap">
              <Link className="btn light" to={`/events/${item.eventId}`}>
                View event proposal
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
    </div>
  );
}
