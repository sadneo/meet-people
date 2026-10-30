# Pebble API, routes and browser storage

*As of 23 October 2026. Describes the code as it stands on `feature/events-backend`. Items marked **(branch)** are on that branch but not yet committed, merged or deployed. Everything else is already in `dev`.*

---

## TL;DR

- **Requests:** the browser talks to Supabase only to sign in. All app data goes through the Express API on Cloud Run (`/api/*`, behind Firebase Hosting). The browser makes no direct database calls.
- **Public API:** only `GET /api/events`, `GET /api/events/:id`, the sign-in email check (`POST /api/auth/email`) and health/hello. Everything else (over 50 routes for account, matching, events, messaging and safety) needs a signed-in Supabase token, and the database checks each call as that user. There is no third-party developer API.
- **Event data (branch):**
  - only live events and their public fields are returned, with no interest counts;
  - the database function that serves them can only be called by the API, so the public Supabase key can't be used to get around the API;
  - the old "event company" feature is removed.
- **Rate limits:**
  - **in the API, per client address:** 600 requests per 15 minutes overall and 300 per 15 minutes for events **(branch)**, and 10 email checks per 10 minutes;
  - **in the database, per user:** 30 messages a minute and 10 connection requests a day;
  - **spoofing (branch):** a caller can no longer fake their address to dodge the limits;
  - **caveats:** API counts are kept per server instance (up to 2) and reset on every deploy. The photo, search-location and safety-report limits exist only in `docs/` and may not be applied in production.
- **Caching (branch):** event responses are cached for 60 seconds in the API, the browser and possibly the Firebase CDN. All other API responses are never cached.
- **Cookies:** Pebble sets none. The sign-in session and a few device or prototype settings are kept in `localStorage`. Google sign-in and external images may set their own cookies. The Cookie Policy page matches this.
- **Before shipping the branch:** apply the two migrations, deploy the API, measure the proxy hop count with `LOG_CLIENT_IP=1`, set `TRUST_PROXY_HOPS`, then deploy the web app.

---

## 1. How requests flow

```
Browser ──► Firebase Hosting ──/api/**──► Cloud Run "pebble-api" (Express, max 2 instances)
   │                                            │
   │                                            ├─ service key ──► Supabase (event reads, email lookup)
   │                                            └─ user's token ─► Supabase RPCs (RLS applies as that user)
   │
   └──── supabase-js, publishable key ──► Supabase Auth only (sign-in, sign-up, session refresh)
```

- **The browser never reads or writes database tables directly.** The frontend has no `supabase.from()` or `supabase.rpc()` calls. It uses Supabase directly only for **auth**. All data goes through `/api/*`.
- **Signed-in API calls carry `Authorization: Bearer <Supabase access token>`.** The API checks it with Supabase (`auth.getUser`) and rejects anonymous users. It then calls fixed, named database functions as that user, so database row security applies. A request can't choose which function is called.
- **The service key stays on the server.** Only two things use it: event reads and the email lookup.

## 2. API routes

Every response is `Cache-Control: private, no-store` unless noted otherwise.

### Public (no sign-in)

| Route | What it does | Limits |
|---|---|---|
| `GET /api/health` | Liveness check | Not rate limited |
| `GET /api/hello?name=` | Demo endpoint | Global limit |
| `GET /api/events` | Upcoming events, plus the category list. Query: `category`, `page` (1–100), `limit` (1–50), and optionally `latitude` + `longitude` for distance. **(branch)** | 300 per 15 min, plus the global limit. Cached 60 s. |
| `GET /api/events/:id` | One live event, or 404 **(branch)** | Same as above |
| `POST /api/auth/email` | `{ email }` → `{ exists: boolean }`, so the sign-in screen knows whether to show sign-in or sign-up | 10 per 10 min, plus the global limit |

**What event routes return:**
- **Which events:** only live ones (status active or rescheduled, not yet ended).
- **Which fields:** public ones only (title, times, place, image, source link). Coordinates are used to work out the distance, then removed.
- **Interest counts:** no longer included **(branch)**.

**Removed (branch):** `GET` and `POST /api/events/:id/company` now return 404.

### Signed in: `/api/matchmaking/*`

| Area | Routes |
|---|---|
| Account and profile | `GET/PUT /account`, `GET/PUT /account-profile`, `GET/PUT /profile`, `GET/PUT /profile-details` |
| Settings | `GET/PUT /detailed-settings`, `GET /friends-search-preferences/runtime`, `GET/PUT /friends-search-preferences`, `GET/PUT /dating-preferences` |
| Friends queue | `POST /queue` (`{ mode: active \| downtime }`), `DELETE /queue`, `GET /status`, `GET /result` |
| Dating | `GET /dating/status`, `PUT /dating/enabled`, `POST /dating/candidate`, `POST /dating/requests/:target` |
| Event group queue | `GET/POST/DELETE /events/:listingId/group-queue` |
| Event compatibility | `GET /events/:listingId/status`, `POST/DELETE /events/:listingId/interest`, `GET /events/:listingId/matches` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read` |
| Search location | `GET /search-locations/places`, `POST /search-locations/resolve`, `POST /search-locations/browser`, `GET /search-locations/:mode/:referenceId` |
| Profile photo | `GET/PUT/DELETE /profile-photo`, `GET /profile-photo/reference/:owner`, `GET /profile-photo/:owner/:revision` |
| Safety | `GET /safety/blocks`, `GET/PUT/DELETE /safety/blocks/:targetId`, `POST /safety/reports`, `GET /safety/reports/:requestId` |

**Photo uploads:**
- **Accepted:** JPEG, PNG or WebP up to 5 MB, and at most 16 megapixels.
- **Stored:** re-encoded as a JPEG of at most 512×512 px and 256 KB.
- **Headers:** responses send `nosniff`.

The safety routes have no screen wired to them yet.

### Signed in: `/api/connections/*` and `/api/conversations/*`

| Route | What it does |
|---|---|
| `GET /api/connections` | Your connections |
| `GET / POST / DELETE /api/connections/:targetId`, `POST /api/connections/:targetId/accept` | Read, request, remove or accept a connection |
| `GET /api/conversations?page=` | Inbox |
| `GET /api/conversations/activity` | Unread activity |
| `GET /api/conversations/:id/messages?before=\|after=` | Message history |
| `POST /api/conversations/:id/messages` | Send a message (1–2000 characters, with a client request ID so a retry doesn't send it twice) |
| `POST /api/conversations/:id/read` | Mark as read |
| `POST /api/conversations`, `POST /api/conversations/:id/leave` | Always return 503. Event-group chats can't be created or left yet. |

### Not an HTTP route
- **The event group worker** (`pnpm start:worker`) is a separate background process that forms event groups. It's off by default.
- **The local development sign-in** (`dev/development-login.ts`) exists only in the local Vite dev server and is never built into production.

## 3. Rate limits

### In the API (per client address, kept in memory)

| Limit | Applies to |
|---|---|
| **600 per 15 min** | Every `/api` route except `/api/health` **(branch)** |
| **300 per 15 min** | `/api/events/*` **(branch)** |
| **10 per 10 min** | `POST /api/auth/email` |

**How the client address is found (branch):**
- **The problem it fixes:** before, a caller could send a fake `X-Forwarded-For` header to look like a new person every time and dodge the limits.
- **Now:** the API trusts only `TRUST_PROXY_HOPS` proxies. The default is 1 in production and 0 locally.
- **Setting it:** the deploy script and the release workflow pass `TRUST_PROXY_HOPS` and `LOG_CLIENT_IP` through as GitHub variables.

**Caveats:**
- **Per instance:** each Cloud Run instance (up to 2) keeps its own counts.
- **Reset on deploy:** counts start again whenever the API restarts.
- **Shared networks:** many people on the same campus Wi-Fi share one address. 600 per 15 minutes should be enough headroom; watch for 429s.

### In the database (per user, survives restarts)

| Limit | Defined in |
|---|---|
| **30 messages per minute** (`MSG11`) | `supabase/migrations/20261013125000_messaging.sql` |
| **10 connection requests per 24 h** (`CON04`) | `supabase/migrations/20261013130000_connection_requests.sql` |
| Photo changes (`PH429`), search locations (`LC429`), safety reports (`SR429`) | **Only in `docs/*-migration.sql`.** See decision 5. |

### Supabase Auth
Sign-in, sign-up, password reset and email OTP use Supabase's own auth rate limits (set in the Supabase dashboard). The app doesn't change them.

## 4. Caching (branch)

| Layer | What | How long |
|---|---|---|
| **API memory** | Event list pages and event details. Concurrent misses share one database query. Failures and 404s aren't stored. Distance is worked out per viewer, after the cache. | 60 s |
| **Browser** | Event responses send `public, max-age=60` | 60 s |
| **Firebase CDN** | Event requests carry no login token, so the CDN *may* share cached copies between visitors (it won't cache anything that has an `Authorization` header or a cookie) | Up to 60 s |
| **Everything else in `/api`** | `private, no-store`, set by the API | Never cached |
| **Static assets** | `/assets/**` is `public, max-age=31536000, immutable`; HTML is `no-cache` | `firebase.json` |

`firebase.json` no longer forces `no-store` on `/api/**`, because that rule would have overridden event caching. The API now sets `no-store` itself.

So an event change can take up to about a minute to show up.

## 5. Database access lock-down (branch)

- **`public_live_events(category, offset, limit, id)`** is the only way to read events.
  - It returns live events and public columns only.
  - It caps page size at 51 and the offset at 5000.
  - **Only the service role** can call it. The `anon` and `authenticated` roles get "permission denied".
- **`event_categories()`** is service-only, unchanged.
- **The `listings` table** isn't readable by `anon`.
- **Dropped:** `event_company_action`, `event_company_snapshot` and `event_interest_counts`. Their tables are kept.
- **Result:** someone holding the public publishable key (it's in the web bundle, which is normal) can't read event data directly from Supabase. Every read goes through the API's limits and cache.

## 6. Cookies and browser storage

**Pebble sets no cookies.** Neither the web app nor the API sets any. The API reads no cookies, and CORS allows only the `Authorization` and `Content-Type` headers.

| Storage (all `localStorage`) | Key | Purpose |
|---|---|---|
| Supabase session | `sb-<project-ref>-auth-token` (set by supabase-js) | Access and refresh tokens that keep you signed in |
| Matching display preferences | `pebble.matchmaking-display-preferences` | Display choices on this device |
| Prototype matchmaking profile | `pebble.matchmaking-profile` | Prototype only |
| Prototype community / economy | `pebble:full-ui:community:v1` | Prototype only |

**Profile photos** are held only in memory as temporary object URLs. They're never stored in the browser or given a public link.

**Third parties that may set their own cookies:**
- **Google sign-in:** on Google's domains.
- **External event images and links:** their own sites.
- **Firebase Hosting:** none expected, still to be confirmed.

**What the Cookie Policy says (`/cookies`):** the app uses local storage, sets no cookies directly, and has no analytics, ads or tracking. That matches the code.

**Note on the session token:** keeping it in `localStorage` is supabase-js's default. It means a cross-site-scripting bug could read the session. Moving to cookies would need server-side session handling the app doesn't have.

**CORS allowed origins:**
- `https://localhost` and `capacitor://localhost` (the native app);
- anything listed in `CORS_ORIGINS`;
- requests with no `Origin` header.

The web app calls the API from its own origin through the Firebase rewrite.

## 7. Web app pages

| Access | Paths |
|---|---|
| **Public** | `/welcome`, `/terms`, `/privacy`, `/cookies`, `/explore` and `/explore/:id` (guest events) |
| **Sign-in pages** | `/login`, `/register`, `/auth/callback`, `/auth/forgot-password`, `/forgot-password`, `/reset-password` |
| **Signed in** | `/`, `/home`, `/community`, `/matchmaking`, `/downtime-matchmaking`, `/events`, `/events/:id`, `/free-time/*`, `/messages`, `/messages/chat`, `/profile`, `/profile/person`, `/settings`, `/intro`, `/complete-profile`, `/onboarding`, `/prototype/yzcommunity` |

Signed-out visitors to a signed-in page are sent to sign in.

**Sign-in methods:** email and password, email link (OTP), and Google.

## 8. What changed on this branch

**Behaviour:**
- **No more refetching:** opening an event no longer reloads the list.
- **Caching:** event reads are cached (section 4).
- **Rate limits:** the global and events limits were added, and spoofing the client address is blocked (section 3).

**Removed:**
- **Event company:** the API routes, the screen, the interest counts on cards (the footer now reads "Find a group to go with"), the three database functions and their tests.

**Database:**
- **Lock-down:** event reads now go through one service-only function (section 5).
- **Migrations:** `supabase/migrations/20261022120000_retire_event_company.sql` and `supabase/migrations/20261022121000_public_event_reads.sql`.

**Other:**
- **Validation:** the page cap is 100, unknown IDs give a 404, and database errors give a 503.
- **Deploy settings:** the `TRUST_PROXY_HOPS` and `LOG_CLIENT_IP` settings.
- **Tests:** new tests for caching, rate limits, spoofing, anonymous event requests and database permissions.
- **Results:** no new unit or browser failures. The 40 unit and 17 browser failures already on `dev` are unchanged.

### Shipping order
1. **Apply the migrations** to the hosted Supabase. The new API needs `public_live_events`.
2. **Deploy the API** with `LOG_CLIENT_IP=1`.
3. **Measure the hops:** call `/api/health`, read the `Client address check` log line, and set `TRUST_PROXY_HOPS`.
4. **Redeploy** with logging off.
5. **Deploy the web app.** The old web app's company screen will stop working after step 1; nothing links to it.

## 9. Open items

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | **Merge and ship the events branch?** | Ship as is / hold | **Ship.** No new test failures. To deploy, apply the two migrations first, then deploy the API, then the web app. See [Shipping order](#shipping-order) above. |
| 2 | **Who measures the production proxy hops?** | Someone with Cloud Run log access | **Do it in the first deploy.** Set `LOG_CLIENT_IP=1`, call `/api/health`, read the log, set `TRUST_PROXY_HOPS`, then turn logging off. Until then the default (1) is a best guess. |
| 3 | **Rate-limit counts live in each server's memory** | Accept / move to a shared store (Redis or the database) | **Accept for now.** With at most 2 instances, a caller gets at most 2× the limit, and counts reset on deploy. Revisit when traffic grows. |
| 4 | **`POST /api/auth/email` tells anyone whether an email has an account** | Keep (the sign-in screen needs it) / change the sign-in flow | **Keep, but decide consciously.** It's limited to 10 checks per 10 minutes per address. Most consumer apps accept this trade-off. |
| 5 | **Some database rate limits exist only as docs** | Move them into `supabase/migrations` / confirm they're already on the hosted database | **Confirm first.** The photo-change limit (`PH429`), search-location limit (`LC429`) and safety-report limit (`SR429`) are defined only in `docs/*-migration.sql`. If they were never applied by hand, those limits don't exist in production. |
| 6 | **Retired "event company" tables** | Keep / drop later | **Keep.** Old event-group chats still read display names from them. Nothing can write to them any more. |
| 7 | **Cookie Policy wording** | Leave / update | **Leave.** "The app sets no cookies" is still true. The policy already says hosting and third-party storage still need confirming. |
