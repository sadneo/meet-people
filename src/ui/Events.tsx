import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { BrowserEventsResponseSchema as EventsResponseSchema, BrowserEventSchema as EventSchema } from "../features/events/client";
import type { EventGroupQueue } from "../../shared/matchmaking";
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
  Icon,
  Modal,
  PersonPhoto,
  ResourceState,
} from "./common";
import { useCurrent } from "./current";

export function Events({ publicView = false }: { publicView?: boolean }) {
  const [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [filtersOpen, setFiltersOpen] = useState(false);
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
  const availableCategories = resource.value?.categories ?? [];
  const creativeCategory = availableCategories.includes('Arts') && !availableCategories.includes('Creative') ? 'Arts' : 'Creative';
  const categories = [...new Set(['Music', 'Food', 'Outdoors', creativeCategory, 'Social', 'Workshops', ...availableCategories, ...(category ? [category] : [])])];
  const categoryLabel = (value: string) => value === 'Arts' ? 'Creative' : value;
  function selectCategory(value: string) {
    setCategory(value);
    setPage(1);
  }
  const content = (
    <section className="events-page" aria-labelledby="events-title">
      <div className="pagehead">
        <h2 id="events-title">Events</h2>
        <button type="button" className="btn light event-filter-button" aria-label="Filter events" onClick={() => setFiltersOpen(true)}>
          <Icon name="Filter" />
        </button>
      </div>
      {publicView && <p className="mini muted">Sign in for more events</p>}
      <div className="event-categories" role="group" aria-label="Event categories">
        {['', ...categories].map(item => <button key={item} type="button" aria-pressed={category === item} className={category === item ? 'selected' : ''} onClick={() => selectCategory(item)}>
          {category === item && <Icon name="Check" />}{categoryLabel(item) || 'All'}
        </button>)}
      </div>
      {filtersOpen && <Modal title="Filter events" close={() => setFiltersOpen(false)}>
        <label htmlFor="event-category-filter">Category</label>
        <select id="event-category-filter" value={category} onChange={event => selectCategory(event.target.value)}>
          <option value="">All events</option>
          {categories.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}
        </select>
        <div className="row wrap">
          <ActionButton onClick={() => setFiltersOpen(false)}>Done</ActionButton>
          <ActionButton secondary onClick={() => selectCategory('')}>Reset filters</ActionButton>
          <ActionButton secondary disabled={resource.loading} onClick={resource.reload}>Refresh events</ActionButton>
        </div>
      </Modal>}
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
      <div className="eventgrid event-directory">
        {resource.value?.events.map((event) => (
            <Link className="event-card" key={event.id} to={`${publicView ? "/explore" : "/events"}/${event.id}`} aria-label={`${event.title}: see event and people`}>
                <img
                  className="event-image"
                  loading="lazy"
                  src={safeImage(event.image_url)}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = "/images/event-placeholder.svg";
                  }}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              <div className="event-card-body">
              <span className="event-category">{categoryLabel(event.category ?? "Event")}</span>
              <h3>{event.title}</h3>
              <span className="event-date">{event.starts_at && !Number.isNaN(Date.parse(event.starts_at))
                ? `${new Date(event.starts_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(event.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
                : 'Date to be announced'}</span>
              <span className="event-location"><Icon name="Location" /><span>
                {[event.location_name, event.city].filter(Boolean).join(' · ') || 'Location to be announced'}
              </span></span>
              <div className="event-card-footer">
                <span className="event-company"><Icon name="Friends" /><span>Find people looking for company</span></span>
                <span className="event-cta">See event &amp; people <Icon name="ArrowRight" /></span>
              </div>
              </div>
            </Link>
        ))}
      </div>
      {resource.value && (page > 1 || resource.value.hasMore) && (
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
    </section>
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
  const [now, setNow] = useState(Date.now);
  const startsAt = Date.parse(event?.starts_at ?? "");
  useEffect(() => {
    if (!Number.isFinite(startsAt) || startsAt <= now) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, startsAt - Date.now()), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [startsAt, now]);
  const groupAvailable =
    !!event &&
    ["active", "rescheduled"].includes(event.status) &&
    startsAt > now;
  return (
    <div className="event-detail">
      {!event && <Link className="account-back" to={publicView ? "/explore" : "/events"}>‹ Events</Link>}
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={resource.reload}
      />
      {event && (
        <>
          <header className="event-detail-header"><h1>{event.title}</h1><Link className="round" aria-label="Close event" to={publicView ? '/explore' : '/events'}>×</Link></header>
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
          <p className="event-detail-category">{event.category}</p>
          <p className="event-description">{event.description}</p>
          <p className="event-detail-date">{eventDate(event.starts_at, event.ends_at)}</p>
          <p className="event-detail-location">
            {[event.location_name, event.address, event.city]
              .filter(Boolean)
              .join(" · ") || "Location to be announced"}
          </p>
          <p className="event-company"><Icon name="Friends"/>Find people looking for company</p>
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
          {publicView ? groupAvailable ? (
            <p>
              <Link
                className="btn"
                to={`/login?${new URLSearchParams({ returnTo: `/events/${id}` })}`}
              >
                Sign in to find a group
              </Link>
            </p>
          ) : (
            <p>Group matching is closed for this event.</p>
          ) : (
            <EventGroup id={event.id} available={groupAvailable} />
          )}
        </>
      )}
    </div>
  );
}
function EventGroup({ id, available }: { id: string; available: boolean }) {
  const current = useCurrent(),
    client = useMemo(
      () => matchmakingClient(current.session.access_token),
      [current.session.access_token],
    ),
    action = useAction();
  const shouldPoll = useCallback(
    (value: EventGroupQueue) => available && !action.busy && value.state === "waiting",
    [available, action.busy],
  );
  const state = useLoad(
    useCallback((signal) => client.groupQueue(id, signal), [client, id]),
    { intervalMs: 3000, shouldPoll },
  );
  return (
    <section className="event-group-controls">
      <h3 className="event-group-heading" aria-live="polite">
        {available && state.value?.state === "waiting" && (
          <span className="group-search-spinner" aria-hidden="true" />
        )}
        {state.value?.state === "proposal"
          ? "Suggested group"
          : !available
            ? "Group matching closed"
            : state.value?.state === "waiting"
              ? "Waiting for a group"
              : "Find a group to go with"}
      </h3>
      <ResourceState
        loading={state.loading}
        error={state.error}
        reload={state.reload}
      />
      <ErrorMessage>{action.error}</ErrorMessage>
      {state.value?.state === "proposal" ? (
        <>
          <p>Here are the people in your suggested group for this event.</p>
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
            A suggested group doesn’t confirm attendance or create a group chat.
          </p>
        </>
      ) : (
        state.value && (
          <p>
            {!available
              ? "Group matching is closed for this event."
              : state.value.state === "waiting"
                ? "You’re in this event’s queue. Your group will appear here automatically when it’s ready."
                : "Join the queue to find other people interested in going."}
          </p>
        )
      )}
      <div className="row wrap">
        {state.value && state.value.state !== "idle" && (
          <ActionButton
            disabled={action.busy || state.loading}
            onClick={state.reload}
          >
            Refresh group status
          </ActionButton>
        )}
        {state.value && (state.value.state !== "idle" || available) && (
          <ActionButton
            secondary={state.value.state !== "idle"}
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
      </div>
    </section>
  );
}
