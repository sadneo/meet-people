# Discovery profile details

Migration `20261029000000_discovery_profile_details.sql` extends the existing
Friends and Dating candidate projections. Their authentication, eligibility,
bilateral block checks, consent and locking remain in place. No new public
profile lookup or privileged browser endpoint is introduced.

- `details` contains only nonempty education, occupation and languages whose
  owner visibility flags are enabled. Owner revisions and visibility flags are
  never returned.
- `sharedAvailability` is null unless both accounts enable `showAvailability`
  and configure a timezone. The same canonical, DST-aware schedule intervals
  used for scoring are intersected for the next 14 days.
- A summary requires at least 30 minutes within one viewer-local period:
  late night (00–06), morning (06–12), afternoon (12–18) or evening (18–24).
  Only weekday, period and the viewer's timezone are returned—not exact dates,
  durations, individual windows, or the other person's timezone.
- The UI omits unavailable/hidden data, renders genuine supplied facts, and
  never substitutes demo education or a fabricated shared-time explanation.

The helper is private and not executable by anonymous/authenticated roles.
Only the existing authorized projection functions call it. Optional contract
fields preserve compatibility with older projections during rollout.

Apply through the canonical local matchmaking migration directory without a
database reset. The running local preview has this migration installed. Local
seed/development accounts were explicitly opted into summaries for UI review;
ordinary accounts retain their existing default-off sharing settings.

Regression coverage includes strict candidate schemas, browser rendering and
rollback-only SQL checks for visibility, bilateral opt-in, timezone differences,
nonoverlapping schedules, helper permissions, and ineligible candidate rejection.
