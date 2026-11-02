# Garden/frontend integration into current dev

Prepared November 1, 2026 on `yz/prototype-integration`.

## Combined revisions

The integration retains `d601fb0` Garden/frontend work and incorporates dev
`34a1f27` (PR #40), including PR #38's Events function and deployment changes.
The actual merge had 78 conflicted paths, all resolved. The previous tested
resolutions were reused. Three overlapping files required
reconciliation with the newest dev: Discover, Settings, and the UI plan.

## Preserved behavior

- All 26 integrated Garden art/implementation files are unchanged: currency,
  unique Mystery Geodes, inventory, drag positioning, reset and local ownership.
- Newer profile photo drafts/save/cancel/reconciliation, message polling and
  permission checks, canonical interest scoring, one-interest admission,
  search-area summaries, privacy sharing controls and QA tooling remain.
- API, shared schemas, query cache, database types/migrations, CI/deployment,
  legal policies and package dependencies retain current dev behavior.
- The obsolete `src/ui/Garden.tsx` wrapper is replaced by the integrated Garden
  route. It is the only file removed relative to current dev.
- The frontend still hides Dating below 18 and rejects under-13 admission.
  Backend eligibility rules are unchanged; the Friends age-policy discrepancy
  remains a team decision, not a UI security guarantee.

## Validation and limits

The actual branch production build and clean-tree lint passed. Unit tests passed
551 checks across 80 files (excluding the Unix-shell worker test). The final
full browser run passed all 200 checks. The two adjusted browser files also
passed 42 checks over three repeats. An intermittent Events timeout did not
recur in ten targeted repeats or the final full run; monitor it in CI.
Two non-deploying configuration checks passed. Local evidence is in
`tmp/integration-push-20261101/`. Browser tests use
isolated fixtures; they do not establish live server persistence or security.
The minimum-interest browser fixture now tests blocking removal of the last
interest and permitting a reduction from two to one. Mobile geometry is sampled
in one browser frame to avoid a lazy development-toolbar layout race.

The Unix-shell worker deployment test and Linux-only QA harness need Linux CI.
The QA ownership checks gave 6 passes and one Windows path-separator assertion
failure; the harness documentation explicitly supports Linux. No application or
teammate harness logic was changed to mask this limitation. No database reset,
migration application, account provisioning or real-data test was run.

Garden economy/ownership remain account-keyed browser storage, not server-backed.
Production bundle size still produces the existing advisory warning. Android,
hosted providers and populated-database deployment need their normal acceptance.

Latest dev's deployment workflow sends dev pushes to sandbox and main pushes
to production. This feature-branch update does not merge into either branch or
deploy. Required GitHub CI and team review remain the gate before merging the PR.
