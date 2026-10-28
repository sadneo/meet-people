import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { EventsResponseSchema, EventSchema } from "../../shared/events";
import {
  eventRequest,
  eventDate,
  safeImage,
  sourceLink,
} from "../features/events/client";
import { matchmakingClient } from "../features/matchmaking/client";
import { useAction, useLoad } from "./hooks";
import {
  ActionButton,
  Brand,
  Empty,
  ErrorMessage,
  PersonPhoto,
  ResourceState,
} from "./common";
import { useCurrent } from "./current";

export function Events({ publicView = false }: { publicView?: boolean }) {
  const [category, setCategory] = useState(""),
    [page, setPage] = useState(1);
  const resource = useLoad(
    useCallback(
      (signal) =>
        eventRequest(
          `?${new URLSearchParams({ page: String(page), limit: "12", ...(category ? { category } : {}) })}`,
          EventsResponseSchema,
          { signal },
        ),
      [category, page],
    ),
  );
  const content = (
    <>
      <div className="pagehead">
        <h2>Something to go to.</h2>
        <ActionButton
          secondary
          onClick={resource.reload}
          disabled={resource.loading}
        >
          Refresh events
        </ActionButton>
      </div>
      <label className="event-category">
        Category
        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All events</option>
          {[
            ...new Set([
              ...(resource.value?.categories ?? []),
              ...(category ? [category] : []),
            ]),
          ].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={resource.reload}
      />
      {resource.value && !resource.value.events.length && (
        <Empty title="No events here yet.">
          <p>Try another category or check again later.</p>
        </Empty>
      )}
      <div className="eventgrid">
        {resource.value?.events.map((event) => (
          <article className="card" key={event.id}>
            <Link to={`${publicView ? "/explore" : "/events"}/${event.id}`}>
              <div className="eventart">
                <img
                  src={safeImage(event.image_url)}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/images/event-placeholder.svg";
                  }}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              </div>
              <span className="badge">{event.category ?? "Event"}</span>
              <h3>{event.title}</h3>
            </Link>
            <p className="mini">{eventDate(event.starts_at, event.ends_at)}</p>
            <p className="muted mini">
              {event.location_name ?? event.city ?? "Location to be announced"}
            </p>
            <Link
              className="text-link"
              to={`${publicView ? "/explore" : "/events"}/${event.id}`}
            >
              View event
            </Link>
          </article>
        ))}
      </div>
      {resource.value && (
        <div className="row pagination">
          <ActionButton
            secondary
            disabled={page <= 1 || resource.loading}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous
          </ActionButton>
          <span>Page {page}</span>
          <ActionButton
            secondary
            disabled={!resource.value.hasMore || resource.loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </ActionButton>
        </div>
      )}
    </>
  );
  return publicView ? (
    <div className="public-page">
      <header className="welcome-header">
        <Brand />
        <Link className="btn" to="/login">
          Sign in
        </Link>
      </header>
      <main>{content}</main>
    </div>
  ) : (
    content
  );
}
export function EventDetail({ publicView = false }: { publicView?: boolean }) {
  const { id = "" } = useParams(),
    resource = useLoad(
      useCallback(
        (signal) =>
          eventRequest(`/${encodeURIComponent(id)}`, EventSchema, { signal }),
        [id],
      ),
    );
  const event = resource.value,
    source = event ? sourceLink(event.source_url) : null;
  return (
    <div className="event-detail">
      <Link to={publicView ? "/explore" : "/events"}>‹ Events</Link>
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={resource.reload}
      />
      {event && (
        <>
          <img
            className="event-cover"
            src={safeImage(event.image_url)}
            alt=""
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = "/images/event-placeholder.svg";
            }}
          />
          <h1>{event.title}</h1>
          <p>{eventDate(event.starts_at, event.ends_at)}</p>
          <p>
            {[event.location_name, event.address, event.city]
              .filter(Boolean)
              .join(" · ") || "Location to be announced"}
          </p>
          <p className="event-description">{event.description}</p>
          {source && (
            <a
              className="btn light"
              href={source}
              target="_blank"
              rel="noreferrer"
            >
              View original listing
            </a>
          )}
          {publicView ? (
            <p>
              <Link
                className="btn"
                to={`/login?${new URLSearchParams({ returnTo: `/events/${id}` })}`}
              >
                Sign in to find a group
              </Link>
            </p>
          ) : (
            <EventGroup id={event.id} />
          )}
        </>
      )}
    </div>
  );
}
function EventGroup({ id }: { id: string }) {
  const current = useCurrent(),
    client = useMemo(
      () => matchmakingClient(current.session.access_token),
      [current.session.access_token],
    ),
    action = useAction();
  const state = useLoad(useCallback(() => client.groupQueue(id), [client, id]));
  return (
    <section className="card section">
      <h3>Find a group to go with</h3>
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {state.value?.state === "proposal" ? (
        <>
          <p>Your group proposal is ready.</p>
          <div className="proposal-members">
            {state.value.proposal?.members.map((member) => (
              <div key={member.id}>
                <PersonPhoto
                  id={member.id}
                  name={member.name}
                  fallback={member.avatar}
                />
                <span>{member.name}</span>
              </div>
            ))}
          </div>
          <p className="account-note">
            A proposal doesn’t confirm attendance or create a group chat.
          </p>
        </>
      ) : (
        state.value && (
          <p>
            {state.value.state === "waiting"
              ? "You’re in this event’s group queue. Check back for a proposal."
              : "Join the queue to find other people interested in going."}
          </p>
        )
      )}
      <div className="row wrap">
        {state.value && (
          <ActionButton
            disabled={action.busy || state.loading}
            onClick={() => {
              void action.run(async () => {
                try {
                  if (state.value!.state === "idle") await client.groupJoin(id);
                  else await client.groupLeave(id);
                } finally {
                  state.reload();
                }
              });
            }}
          >
            {state.value.state === "idle"
              ? "Join group queue"
              : "Leave group queue"}
          </ActionButton>
        )}
        <ActionButton
          secondary
          disabled={action.busy || state.loading}
          onClick={state.reload}
        >
          Check proposal
        </ActionButton>
      </div>
    </section>
  );
}
