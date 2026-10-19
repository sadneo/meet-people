---
id: FORMS-02
area: settings
severity: P2
type: visual
page: /settings
viewport: 320x568; 390x844; 800x844; 801x844; 1280x720; 1920x1080
user: grace
---
**Summary:** Social preferences fields and helper text touch the card edges, breaking the alignment and spacing used throughout Settings.

**Steps:** Open `/settings` as grace and scroll to **Social preferences**.
**Expected:** Labels, selects, time choices, and helper copy share the sibling Settings sections' 16px compact / 24px expanded content inset and deliberate vertical spacing.
**Actual:** Controls and text start just 1px from the card's outer edge. The full-width selects touch both card borders, while neighboring notification/privacy rows have readable inner padding.
**Evidence:** `screenshots/FORMS-settings-social-390x844.png`; `screenshots/FORMS-settings-social-1280x720.png`; `scratch/forms-messages-scan.json` confirms 1px inset and zero fieldset padding at every size.
**Reproduced:** All six tested viewports.
**Proposed fix:** In `src/features/prototype/settings.css`, give the direct section fieldset scoped body padding aligned with the existing Settings rows, and normalize its outer margin. Preserve nested time-choice fieldsets, labels, controls, helper copy, and persistence behavior.

