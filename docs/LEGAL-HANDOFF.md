# Policy publication handoff

Updated October 18, 2026. This pass improves visible policy copy and layout only.
Removing the visible “Draft” label does not establish legal review or resolve
publication requirements. The pages describe the current implementation without
new promises about compliance, retention, or data rights procedures.

Still needs team confirmation before publication:

- **Team/operator:** legal operator name and a monitored public support/privacy
  email. Replace the two values in `legalPublication` in
  `src/features/public/legal-content.ts`; both remain
  `[TO BE CONFIRMED BEFORE PUBLICATION]`.
- **Aidan / deployment owner:** actual hosting providers, provider cookies and
  storage, logging/access practices, and authentication session settings.
- **Team / data owners:** retention periods, account deletion, data export and
  privacy-request handling. No deadlines or deletion guarantees are promised.
- **Xuhan / messaging owner:** notify the policy owner when real message delivery
  or storage replaces sample/local conversations, so the disclosures can change.
- **Team / legal reviewer:** applicable requirements, final terms, and whether
  actual deployed storage requires consent controls. No analytics or tracking
  was added, and no compliance certification is claimed.

The implementation/storage inventory remains in `PUBLIC-FRONTEND.md`; storage
keys and internal preparation details belong there, not in user-facing copy.
All policy navigation uses existing root-relative React Router links. Auth,
backend, storage behavior, Events and footer routes are unchanged.
