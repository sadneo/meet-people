# Google search-area picker

Friends and Dating share a Hinge-style, US-only map picker. Search, GPS and map
movement produce a preview; only **Set search area** saves revisioned preferences.
The picker uses the existing dialog as a subview, not a second stacked dialog.
Profile home, participation, age, distance and reciprocal matching rules are not
changed. The existing `temporary` wire value means an independent search area;
it is no longer a user-facing choice or a promise of a temporary duration.

## Configuration and activation

No Google keys or signing secret are supplied in the repository. Until configured,
the picker explicitly reports that map search is unavailable. A browser test map
is a module-interception fixture only, never a runtime fallback.

1. Create/select a billing-enabled Google Cloud project. Confirm the credit grant's
   eligible products and expiry; the Developer Program Cloud credit allows Maps,
   but other promotions may differ. Enable **Maps JavaScript API**, **Places API
   (New)** and **Geocoding API**. Google Geolocation API is not needed.
2. Create a browser key restricted to Maps JavaScript API and the exact production
   and development referrers. Put it in `VITE_GOOGLE_MAPS_API_KEY`. This key is
   public by design. Do not authorize arbitrary wildcards to fix WebView problems.
3. Create a separate server key restricted to Places/Geocoding, with stable server
   egress IP restrictions where available. Set `GOOGLE_MAPS_SERVER_API_KEY` only on
   the API server. Do not put server keys in Vite-prefixed variables.
4. Test and apply `20261030000000_google_search_locations.sql` after the canonical
   prerequisites. It creates no keys, imports no places and modifies no accounts.
5. Generate a 32-byte random HMAC secret, encoded as 64 hex characters. Configure
   it as `SEARCH_LOCATION_SIGNING_KEY` on the API server. As the database owner,
   install the identical bytes using a parameterized, private operator connection:

   ```sql
   insert into location_private.map_signing_key(singleton,secret)
   values (true, decode(:'signing_key_hex','hex'));
   ```

   Do not paste secrets into committed SQL, shell history, reports or chat. Key
   rotation invalidates outstanding previews but not already issued selections.
6. Arrange a DB-owner purge job at least every 15 minutes:

   ```sql
   -- With pg_cron enabled; run as the owner, never grant the helper to clients.
   select cron.schedule('pebble-map-cache-purge', '*/15 * * * *',
     'select location_private.purge_map_locations();');
   ```

   A deployment without pg_cron needs an equivalent protected owner job. Expired
   locations stop being usable immediately, independently of purge timing. Monitor
   the job and alert on failure; the usable TTL leaves a day of cleanup headroom.
7. Complete the storage/privacy review below **before** setting
   `GOOGLE_MAPS_STORAGE_APPROVED=true`. This is an operator approval, not a legal
   conclusion made by the code. Restart/rebuild as required for environment changes.
8. Set account-wide Google quotas and billing alerts. The additional
   `GOOGLE_MAPS_REQUESTS_PER_DAY` defaults to 2,000 upstream search/preview requests
   per API process per UTC day; users get at most 60/minute per process. This does
   not limit browser map loads, other deployments or other Cloud projects. Alerts
   alone are not hard spending caps. Use a shared limiter for multi-instance scale.

## Data flow and authorization

- The browser requests suggestions through authenticated `/search-locations/map/`
  routes. Session tokens are HMAC-scoped to owner and Friends/Dating mode.
- Place resolution requests `id,location,addressComponents` (Essentials), not
  business details or `displayName`. Google search remains country-restricted, but
  is not city-only, so sublocalities and neighborhoods remain discoverable.
- Reverse geocoding validates US country components and derives a general label.
  It never replaces the user's center with a returned address/building centroid.
- The API signs a ten-minute preview containing owner, mode, random request ID,
  exact selected center, general label, provider ID, origin and timestamps. Signing
  keys are never returned. Confirm requests carry only mode plus this signed ticket.
- `confirm_map_search_location` runs with the caller's JWT, verifies the signature
  against a private database key, rechecks owner and timing, enforces issuance
  quotas and returns a coordinate-free `selected-area` receipt. Changed bytes fail;
  exact retries recover the original receipt before quota/preview-expiry checks.
- Only the existing revision-checked preferences save makes a reference active.
  The browser verifies receipt and preference readback before leaving the picker.
  Issuance is not a preference save. Uncertain saves require explicit reconciliation.
- `get_search_location_map` returns a usable center only to that reference's owner
  and mode. Public receipts, profiles and candidate projections stay coordinate-free.
- Every new selected area remains independent of Profile home. Device-assisted
  issuance requires the saved location opt-in, but does not claim verified physical
  presence. Later disabling GPS does not erase an explicitly chosen manual area.
- Legacy catalogue/home/device assertions retain all previous usability rules.

## Storage/privacy release gate

Google's API-specific terms must be reviewed for this deployment's billing region
and for private matching use. US search coverage does not determine which regional
terms govern the billing account. Do not assume a blanket caching permission.

The implementation bounds selected-area coordinate assertions to **29 days from
provider resolution**, leaving a cleanup margin under the 30-day provider cache
limit, rather than using the old one-hour device TTL. It does not claim indefinite
provider-data storage. There is no automatic GPS update, location history feature,
or background refresh of a user's position. Expiry requires explicit reconfirmation
in this first implementation; a seamless long-term refresh model is not activated.

`purge_map_locations()` removes expired selected-area coordinates, provider IDs,
assertions and idempotency entries; unused confirmations are removed after a 24h
retry window. JSON preferences retain the user's confirmed display label and now
unusable reference, not coordinates. The review must specifically approve that
display-label retention and cross-user matching of privately held centers. If not
permitted, adjust the retention/data model before enabling the feature. Provider
records are not imported into the shared reviewed-place catalogue.

Update the product privacy notice to identify Google Maps, explain transmission
of search text and selected coordinates, and link the applicable Google terms and
privacy policy. Keep Google attribution visible on maps and suggestions. Do not log
query text, coordinates, tickets or upstream URLs containing API keys. Configure
reverse-proxy/APM body capture accordingly. The server reports only sanitized errors.

References:
- https://cloud.google.com/maps-platform/terms/maps-service-terms
- https://developers.google.com/maps/documentation/places/web-service/policies
- https://developers.google.com/maps/documentation/geocoding/policies
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/profile/help/benefits#google-cloud-credits

## Verification and rollout

Automated provider tests intercept Google HTTP; browser tests intercept the map
renderer and APIs; SQL acceptance uses signed synthetic tickets in a network-none
disposable database. These are not evidence of Google credentials, billing or live
search coverage. Live-test Stony Brook, Brooklyn and Upper Manhattan after activation,
plus GPS permission denied, pin movement, reopen/persistence, quota failure and
actual matching. Verify the Android WebView's origin restrictions and location
permissions separately; no background permission or native Maps SDK is introduced.

Before applying locally, take a private DB backup and verify the local project
identity. Hosted activation/migrations require separate operator approval. To
disable new Google queries, set `GOOGLE_MAPS_STORAGE_APPROVED=false`; existing valid
selections keep their TTL and matching behavior. Keep the purge job running.
