import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { EventsResponseSchema, EventSchema } from "../../shared/events";
import {
  eventRequest,
  eventDate,
  safeImage,
  sourceLink,
} from "../features/events/client";
import { useCachedLoad } from "../data/useCachedLoad";
import {
  ActionButton,
  Brand,
  Empty,
  Icon,
  Modal,
  ResourceState,
} from "./common";

export function Events({ publicView = false }: { publicView?: boolean }) {
  const [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [filtersOpen, setFiltersOpen] = useState(false);
  const resource = useCachedLoad(
    useCallback(
      (signal) =>
        eventRequest(
          `?${new URLSearchParams({ page: String(page), limit: "12", ...(category ? { category } : {}) })}`,
          EventsResponseSchema,
          { signal },
        ),
      [category, page],
    ),
    ["events", category, page], 30_000,
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
      {publicView && <p className="mini muted">Explore events. Get Pebble to find a group to go with.</p>}
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
        <a className="btn" href="/#install">
          Get Pebble
        </a>
      </header>
      <main>{content}</main>
    </div>
  ) : (
    content
  );
}
export function EventDetail({ publicView = false, renderGroup }: { publicView?: boolean; renderGroup?: (id: string, available: boolean) => ReactNode }) {
  const { id = "" } = useParams(),
    resource = useCachedLoad(
      useCallback(
        (signal) =>
          eventRequest(`/${encodeURIComponent(id)}`, EventSchema, { signal }),
        [id],
      ),
      ["event", id], 30_000,
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
              <a
                className="btn"
                href="/#install"
              >
                Get Pebble to find a group
              </a>
            </p>
          ) : (
            <p>Group matching is closed for this event.</p>
          ) : (
            renderGroup?.(event.id, groupAvailable)
          )}
        </>
      )}
    </div>
  );
}
