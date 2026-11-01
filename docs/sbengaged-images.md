# SBU event images

The calendar feed provides event details; public CampusGroups detail pages provide
posters. The image extractor prefers the event's JSON-LD image, including graphs,
arrays and ImageObjects, then Open Graph/Twitter metadata and the explicitly
identified event banner. It does not use a navigation image as an event poster.
Relative SBU paths and HTML-escaped image URLs are supported.

CampusGroups redirects `/rsvp_boot?id=…` to an organization-specific path. Detail
requests follow at most three redirects on the same HTTPS SBU origin. Requests
have a ten-second deadline and at most one retry; Retry-After waits are capped at
five seconds. Redirect and retry requests are included in ingestion accounting.

Full ingestion considers up to 250 detail pages, four at a time, with a 45-second
enrichment budget checked between batches. Smoke mode remains capped at five.
Never-enriched pages take priority over checked pages, and image-less pages over
stale posters. Six-hour refresh freshness still applies. A missing image in a
successful refresh preserves an existing poster; a failed fetch preserves both
the poster and its last successful detail-sync timestamp.

The response reports deferred enrichment, and the ingestion run is partial if
pages remain deferred or fail. This avoids reporting a complete image pass after
only checking the first batch. Deploy the updated ingestion function for these
changes to affect hosted ingestion jobs.

## Backfill existing local listings

```sh
pnpm events:images --dry-run
pnpm events:images
pnpm events:images --limit 100
```

The tool accepts only the verified running local `meet-people` Supabase project.
It reads existing active/rescheduled SBU events with missing images, checks their
public detail pages and updates only `image_url` and `details_synced_at`. It keeps
an ignored local before-image and report. Concurrently supplied images or detail
updates are preserved. It does not rescrape event times, remove events, change
queue enrollments, or call an embedding provider.

An event without a public poster retains the neutral image placeholder. The three
fictional demo events also have no real SBU poster to import.
