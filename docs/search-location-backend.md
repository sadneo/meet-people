# Owner search-location issuance candidate

This candidate adds authenticated `/api/matchmaking/search-locations` lookup,
issuance and receipt endpoints. Install `search-location-migration.sql` after the
owner/contact, detailed-settings, Friends-search-preference and Dating candidates.
It is source preparation, not app-database activation or live geocoder integration.

The place catalogue starts empty. Only the new NOLOGIN
`pebble_location_catalog_publisher` role can publish reviewed catalogue entries;
it cannot read private owner data. No membership, credentials, real places or
provider calls are configured. Place selection accepts an ID, never browser-supplied
geocoder coordinates. A home assertion binds the current exact saved home label
and a reviewed alias; a temporary selection binds the catalogue label. Neither
writes home, filters, Dating consent, interests or weekly availability.

Explicit browser geolocation additionally requires the persisted location opt-in.
It accepts a reading no older than five minutes (15 seconds future allowance),
positive accuracy up to 1,000 metres, and explicit consent. Coordinates remain
**device reported**, not verified physical presence. These assertions last one hour;
geocoded anchors last at most 30 days and never beyond catalogue verification.
Owner receipts expose provenance type and expiry, never coordinates. Current home,
catalogue status/coordinates/expiry and device opt-out are rechecked on use.

Issuance uses actor-scoped request IDs and exact payload hashes. Changed-payload
replay conflicts; same-payload replay returns the original receipt before quotas.
Limits are ten new assertions/hour and fifty/day, serialized per actor. Catalogue,
home and opt-in share locks serialize issuance with conflicting changes. Separate
Friends/Dating resources retain their independent CAS saves and references.
Expired/revoked references reject saves without advancing revisions. Private tables,
columns, schemas and helper privileges are denied, including inherited grants.

Frontend selection stays in the open sheet until explicit canonical Save. Cancel
has no preference/profile effect. Unknown issuance outcomes retry the same key and
payload, followed by authoritative receipt readback. Owner/token/source/area/opt-in
changes abort or fence old callbacks; no GPS is read on mount. Missing catalogue
or service remains an honest unavailable state. Friends still discloses that the
current queue does not consume these filters; Dating remains its existing prototype.

## Executed evidence

- `tests/search-locations.sql`: rollback-scoped real PostgreSQL owner/mode isolation,
  idempotency/conflict, consent, current home/opt-out/revocation/expiry, hourly and daily quotas,
  private ACLs, preference CAS/readback and unchanged shared profiles. Synthetic
  places only; no real provider.
- `pnpm --config.verify-deps-before-run=false exec tsx tests/offline/search-locations-api.ts`:
  actual Express-to-SQL lookup/issuance/filter persistence/readback and denials;
  synthetic Auth transport, not live JWT or PostgREST verification.
- `python3 tests/offline/search-location-races.py`: ten actual two-session cases,
  observed `pg_blocking_pids` waits, commit/rollback variants of same-key replay,
  hourly quota, catalogue withdrawal, canonical home change and device opt-out.
  Expected exclusions are LC409/LC403/LC429, not deadlock-as-authorization proof.
- API unit tests, rendered picker/preferences checks and six intercepted browser
  cases cover Friends/Dating at 320/390/1440px, explicit save/cancel, focus and overflow.
  Screenshots were visually inspected; these are UI proof, not live service proof.

Activation gates: reviewed candidate installation and rollback plan; real reviewed
catalogue provenance/import approval; any external geocoder call/provider agreement;
coordinate retention/purge policy; live Auth/PostgREST verification; matcher adoption.
No existing database, provider, credentials, deployment or shared service was touched.
