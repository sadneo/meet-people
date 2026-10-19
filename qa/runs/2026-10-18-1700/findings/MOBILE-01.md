---
id: MOBILE-01
area: mobile
severity: P2
type: a11y
page: /settings; /matchmaking
viewport: 390x844
user: liam
---
**Summary:** Keyboard navigation focuses controls completely behind the fixed bottom navigation, hiding both the control and its focus indicator.

**Steps:**
1. Sign in as liam and open `/settings` at 390×844 from the top of the page.
2. Use Tab repeatedly until the Mornings choice under Usual free time receives focus. Do not scroll with the mouse.
3. Observe the bottom of the screen. Continue through Afternoons and Evenings; those choices are hidden too.
4. Open `/matchmaking` and Tab to the On this device disclosure after the primary matching and preference controls.

**Expected:** The browser scrolls focused content fully above the fixed navigation so keyboard users can see the current control, its label, and its focus indicator.

**Actual:** Mornings is focused at viewport y795–839 while the navigation covers y772–844. The On this device disclosure is focused at y784–829 behind the same navigation. Both are completely covered. A keyboard user must manually scroll to identify the focused control. The defect affects multiple routes, so these symptoms are one shared shell finding.

**Evidence:** `screenshots/MOBILE-focus-hidden-settings-390-recovery-a.png`; `screenshots/MOBILE-focus-hidden-settings-390-recovery-b.png`; `screenshots/MOBILE-focus-hidden-matchmaking-390-recovery-a.png`; `screenshots/MOBILE-focus-hidden-matchmaking-390-recovery-b.png`. Both live recovery runs returned Settings `{focused:[795,839],navTop:772,scrollY:449}` and Matchmaking `{focused:[784,829],navTop:772,scrollY:0}`. Earlier Claude evidence also exists in `scratch/MOBILE/out/tab-390-a.txt` and `tab-390-b.txt`.

**Reproduced:** 2/2 fresh browser sessions on 2026-10-18 during recovery, in addition to the original saved pass. The reproduction script is `scratch/MOBILE/focus-obscured.mjs 390x844 <tag>`.

**Suspected cause (optional):** The compact shell reserves content padding for `--pt-navigation-clearance`, but the document scroll container has no corresponding `scroll-padding-bottom`. Browser focus scrolling treats the covered bottom portion of the viewport as visible.

**Severity rationale:** P2 because controls still work and manual scrolling is a workaround; the invisible keyboard focus makes normal navigation misleading.

**Suggested verification:** Add a keyboard regression beside `e2e/responsive.spec.ts` using its existing mocked signed-in session. Tab from known preceding controls to the local-preferences summary and Settings time choices, then assert their full bounding rectangles lie above `.pt-bottom-nav`, including an injected safe-area allowance. Existing responsive tests assert static placement and dialog clearance, but do not cover focus-triggered scrolling.
