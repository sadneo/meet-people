---
id: MATCH-UX-01
area: matchmaking preferences
priority: medium
type: visual
page: /matchmaking; /downtime-matchmaking
viewport: 320x568; 390x844; 801x844; 1280x720
user: carol
---
**Summary:** The preferences editor spends too much of a short screen on oversized chrome and inherited field spacing, while interest labels wrap awkwardly beside their inputs.

**Steps:** Open either matching page as carol; open Preferences. Inspect the top at 320×568, then scroll to Interests and Weekly availability. Repeat at 390×844 and 1280×720 without saving.

**Observed:** At 320×568 the 29.6px Georgia heading wraps over two lines, Save preferences also wraps, and the footer becomes 102px high. The scrolling body is only 205px high including 44px vertical padding, leaving about 161px for actual fields. One complete field and part of the next fit. At 1280×720 the dialog still shows only Username, Display name and part of Bio because every label inherits `margin: 15px 0` in addition to the form grid gaps. Interests switch from stacked labels to flex rows: `Interest` and `1` split onto separate lines beside a textarea, even on desktop. Three interests and one availability window create a 1,690px scroll body on desktop and 1,980px at 320px.

**Recommended result:** Keep the current light surface, tan backdrop, fixed action footer and native dialog. Use the existing sans-serif app stack with a compact heading; keep the Save label on one line. Give the editor a consistent stacked label/input layout, reset inherited label margins locally, and use deliberate compact spacing between fields. Group an interest's input and removal action so one record can be scanned without a large blank gap. Keep 44px controls and preserve the recent validation-focus fix and all profile fields.

**Evidence:** [320px top](../screenshots/match-prefs-top-320x568.png); [320px interests](../screenshots/match-prefs-interests-320.png); [390px availability](../screenshots/match-prefs-time-390x844.png); [1280px top](../screenshots/match-prefs-top-1280x720.png); [1280px interests](../screenshots/match-prefs-interests-1280.png). Exact computed metrics: `scratch/match-events-details.log` (four independent viewport sessions).

**Suggested source:** `src/features/prototype/matchmaking.css` (`.match-preferences h2`, `.match-live-dialog`, its form/header/footer/body/label rules) and, if row grouping needs a wrapper, `src/features/matchmaking/MatchingScreen.tsx`. Root cause includes `.pt-app label` margins and the higher-specificity `.match-live fieldset label { display: flex }` overriding the dialog's stacked labels. Scope overrides to this editor instead of changing all app forms.

**Scope:** Visual/form density only; no validation, time-format schema, queue or saving contract changes. Reproduced with live saved fields; no writes.
