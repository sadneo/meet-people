import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { PullToRefresh } from './PullToRefresh';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { EventsResponseSchema, EventSchema } from "../../shared/events";
import {
  eventRequest,
  eventDate,
  calendarLink,
  safeImage,
  sourceLink,
} from "../features/events/client";
import { useCachedLoad } from "../data/useCachedLoad";
import { PageSkeleton } from './loading/PageSkeleton';
import { MediaImage } from './loading/MediaImage';
import {
  ActionButton,
  Brand,
  Empty,
  Icon,
  Modal,
  ResourceState,
} from "./common";

export function Events({ publicView = false }: { publicView?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get("category") ?? "";
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 100 ? requestedPage : 1;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const queryClient = useQueryClient();
  const catalog = useQuery<string[]>({ queryKey: ["event-categories"], queryFn: skipToken });
  const resource = useCachedLoad(
    useCallback(
      async (signal) => {
        const result = await eventRequest(
          `?${new URLSearchParams({ page: String(page), limit: "12", ...(category ? { category } : {}) })}`,
          EventsResponseSchema,
          { signal },
        );
        // Keep the last confirmed catalog separate from a category's list/error.
        // The session query provider clears this cache when the account changes.
        if (!signal.aborted) queryClient.setQueryData(["event-categories"], result.categories);
        return result;
      },
      [category, page, queryClient],
    ),
    ["events", category, page], 30_000,
  );
  const availableCategories = catalog.data ?? resource.value?.categories ?? [];
  const creativeCategory = availableCategories.includes('Arts') && !availableCategories.includes('Creative') ? 'Arts' : 'Creative';
  const categories = [...new Set(['Music', 'Food', 'Outdoors', creativeCategory, 'Social', 'Workshops', ...availableCategories, ...(category ? [category] : [])])];
  const categoryLabel = (value: string) => value === 'Arts' ? 'Creative' : value;
  function browse(value: string, nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("category", value);
    else next.delete("category");
    if (nextPage > 1) next.set("page", String(nextPage));
    else next.delete("page");
    if (next.toString() !== searchParams.toString()) setSearchParams(next);
  }
  function selectCategory(value: string) {
    browse(value, 1);
    setFiltersOpen(false);
  }
  const content = (
    <section className="events-page" aria-labelledby="events-title">
      <div className="pagehead">
        <h2 id="events-title">Events</h2>
        <button type="button" className="btn light event-filter-button" aria-label="Filter events" aria-haspopup="dialog" aria-expanded={filtersOpen} aria-describedby={category ? 'event-filter-summary' : undefined} onClick={() => setFiltersOpen(true)}>
          <Icon name="Filter" />Filters
        </button>
      </div>
      {!publicView && <PullToRefresh onRefresh={resource.reload} label="Refreshing events"/>}
      {publicView && <p className="mini muted">Explore events. Get Pebble to find a group to go with.</p>}
      {category && <p id="event-filter-summary" className="event-filter-summary">Category: {categoryLabel(category)}</p>}
      {filtersOpen && <Modal variant="sheet" title="Filter events" close={() => setFiltersOpen(false)}>
        <label htmlFor="event-category-filter">Category</label>
        <select id="event-category-filter" value={category} onChange={event => selectCategory(event.target.value)}>
          <option value="">All events</option>
          {categories.map(item => <option key={item} value={item}>{categoryLabel(item)}</option>)}
        </select>
        <div className="event-filter-actions">
          <ActionButton secondary disabled={!category} onClick={() => selectCategory('')}>Reset filters</ActionButton>
        </div>
      </Modal>}
      <ResourceState
        loading={resource.loading}
        error={resource.error}
        reload={resource.reload}
        skeleton={<PageSkeleton view="events" label="Loading events"/>}
      />
      {resource.value && !resource.value.events.length && (
        <Empty title="No events here yet.">
          <p>Try another category or check again later.</p>
        </Empty>
      )}
      <div className="eventgrid event-directory stagger-in">
        {resource.value?.events.map((event) => (
            <Link className="event-card" key={event.id} viewTransition state={{ fromEventDirectory: true }} to={`${publicView ? "/explore" : "/events"}/${event.id}?${searchParams}`} aria-label={`${event.title}: see event and people`}>
                <EventDateChip startsAt={event.starts_at}/>
                <MediaImage
                  style={{ viewTransitionName: eventImageTransition(event.id) }}
                  className="event-image"
                  loading="lazy"
                  src={safeImage(event.image_url)}
                  fallback="/images/event-placeholder.svg"
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
                {hasStarted(event.starts_at)
                  ? <span className="event-company"><Icon name="Clock" /><span>Happening now</span></span>
                  : <span className="event-company"><Icon name="Friends" /><span>Find people looking for company</span></span>}
                <span className="event-cta">{hasStarted(event.starts_at) ? 'See event' : <>See event &amp; people</>} <Icon name="ArrowRight" /></span>
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
            onClick={() => browse(category, page - 1)}
          >
            Previous
          </ActionButton>
          <span>Page {page}</span>
          <ActionButton
            secondary
            disabled={page >= 100 || !resource.value.hasMore || resource.loading}
            onClick={() => browse(category, page + 1)}
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
// Shared image name lets the card picture grow into the detail cover.
function eventImageTransition(id: string) {
  return `event-image-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;
}
// Listed events are live, so one whose start has passed is in progress.
function hasStarted(startsAt: string | null | undefined) {
  const time = Date.parse(startsAt ?? '');
  return Number.isFinite(time) && time <= Date.now();
}
// Permanent failures (cancelled, ended, unknown or malformed id) can't be fixed by retrying.
function EventUnavailable({ directory, onClose }: { directory: string; onClose: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return (
    <div className="card blank">
      <h3>This event is no longer available</h3>
      <p>It may have ended or been cancelled.</p>
      <Link className="btn" to={directory} onClick={onClose} replace>Browse events</Link>
    </div>
  );
}
const permanentEventErrors = ['This event is no longer available.', 'Invalid event ID.'];
function EventDateChip({ startsAt }: { startsAt: string | null | undefined }) {
  const time = Date.parse(startsAt ?? '');
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  return <span className="event-date-chip" aria-hidden="true">
    <small>{date.toLocaleDateString(undefined, { weekday: 'short' })}</small>
    <b>{date.getDate()}</b>
  </span>;
}
export function EventDetail({ publicView = false, renderGroup }: { publicView?: boolean; renderGroup?: (id: string, available: boolean) => ReactNode }) {
  const location = useLocation();
  const directory = `${publicView ? "/explore" : "/events"}${location.search}`;
  const navigate = useNavigate();
  function closeEvent(event: MouseEvent<HTMLAnchorElement>) {
    // Back restores the directory entry and its filters when a card opened this detail.
    if (location.state?.fromEventDirectory && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      void navigate(-1);
    }
  }
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
      {!event && <Link className="account-back" to={directory} onClick={closeEvent} replace>‹ Events</Link>}
      {permanentEventErrors.includes(resource.error) && <EventUnavailable directory={directory} onClose={closeEvent} />}
      <ResourceState
        loading={resource.loading}
        error={permanentEventErrors.includes(resource.error) ? '' : resource.error}
        reload={resource.reload}
        skeleton={<PageSkeleton view="event" label="Loading event details"/>}
      />
      {event && (
        <>
          <header className="event-detail-header"><h1>{event.title}</h1><Link className="round" aria-label="Close event" to={directory} onClick={closeEvent} replace>×</Link></header>
          <MediaImage
            style={{ viewTransitionName: eventImageTransition(event.id) }}
            className="event-cover"
            src={safeImage(event.image_url)}
            alt=""
            referrerPolicy="no-referrer"
            fallback="/images/event-placeholder.svg"
          />
          <p className="event-detail-category">{event.category}</p>
          <p className="event-description">{event.description}</p>
          <p className="event-detail-date">{eventDate(event.starts_at, event.ends_at)}</p>
          <p className="event-detail-location">
            {[event.location_name, event.address, event.city]
              .filter(Boolean)
              .join(" · ") || "Location to be announced"}
          </p>
          {groupAvailable && <p className="event-company"><Icon name="Friends"/>Find people looking for company</p>}
          <div className="event-detail-links">
          {groupAvailable && calendarLink(event) && (
            <a
              className="btn light"
              href={calendarLink(event)!}
              target="_blank"
              rel="noreferrer"
            >
              Add to calendar
            </a>
          )}
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
          </div>
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
