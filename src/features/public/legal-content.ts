// Publication details intentionally unresolved. See docs/LEGAL-HANDOFF.md.
export const legalPublication = {
  product: 'Pebble',
  operator: '[TO BE CONFIRMED BEFORE PUBLICATION]',
  contactEmail: '[TO BE CONFIRMED BEFORE PUBLICATION]',
  updated: 'October 18, 2026',
}

export type LegalDocument = { title: string; summary: string; sections: { title: string; paragraphs: string[] }[] }
export const legalDocuments: Record<'terms' | 'privacy' | 'cookies', LegalDocument> = {
  terms: {
    title: 'Terms of Service',
    summary: 'A few ground rules for finding people and making plans with Pebble.',
    sections: [
      { title: 'Using Pebble', paragraphs: ['Pebble helps college students discover events and find people with shared interests and free time. A suggested person or group is not a confirmed connection, RSVP, or booking. Check event details with the original organizer.'] },
      { title: 'Your account', paragraphs: ['Provide accurate information and protect your sign-in credentials. Do not impersonate someone, access another person’s account, or use an account to evade restrictions.'] },
      { title: 'Respect and safety', paragraphs: ['Do not harass, threaten, discriminate against, defraud, or exploit others. Do not share private information without permission, post unlawful material, send spam, or disrupt the service.', 'Meet thoughtfully: choose a public place, respect boundaries, and use your judgment. Pebble does not verify every person or guarantee the safety of an in-person meeting.'] },
      { title: 'Your content', paragraphs: ['Only share content you have permission to use. You retain the rights you hold in your content. Pebble stores, processes, and displays submitted profile information to provide account and matching features. The Privacy Policy explains how this information is used.', 'Messaging currently includes sample conversations. Message delivery to other accounts is not yet available in this interface. Do not use it for emergencies.'] },
      { title: 'Events and external services', paragraphs: ['Event information comes from external sources and may change or be incomplete. External listings have their own terms and privacy practices. A listing does not imply a university partnership or organizer endorsement.'] },
      { title: 'Service availability', paragraphs: ['Features may change or become unavailable. Keep a separate copy of important information. Clearing browser data can remove saved Community progress and device preferences.'] },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    summary: 'How Pebble uses your information and the choices available to you.',
    sections: [
      { title: 'Account and profile', paragraphs: ['Pebble uses Supabase Auth for sign-in, email confirmation, and account recovery. If you choose Google sign-in, Google also processes information needed to authenticate you.', 'Depending on the features you use, account information can include your email, username, name, bio, birthdate, city, profile image, interests, availability, preferences, settings, and onboarding progress.'] },
      { title: 'Matching and events', paragraphs: ['Your interests and availability help Pebble suggest people and plans. Matching requests, event interests, group participation, proposals, and notifications can be saved. Other participants may see your name, profile image, interests, and shared availability.', 'You can browse events without sharing your location. If you choose “Show distances from me” and allow location access, Pebble sends your coordinates with the event request to calculate distances. This feature keeps location in memory rather than saving it to your profile. Request URLs may appear in hosting logs.'] },
      { title: 'Messages and Community', paragraphs: ['Messaging currently shows sample conversations and keeps new messages in the open app. It does not deliver those messages to another account.', 'Guest Community progress is saved in your browser. Signed-in Community changes currently last for the app session. Account and matching records are stored separately.'] },
      { title: 'Services and browser storage', paragraphs: ['Supabase provides authentication and database services. Hosting services process requests to deliver Pebble. External image hosts receive network information, such as your IP address, when loading profile or event images. External event links and Google sign-in have their own privacy practices.', 'The Pebble app currently has no analytics or advertising integrations. It uses browser storage for sign-in and selected device features, as explained in the Cookie Policy. Storage and logging used by hosting and external services still need confirmation.'] },
      { title: 'Your choices', paragraphs: ['You can edit supported profile fields and preferences, decline location access, and clear browser-held information through your browser settings. Sign out on shared devices. Clearing browser data does not delete your account or other server-held records.'] },
      { title: 'Retention and requests', paragraphs: ['An account-deletion or data-export option is not currently available in the app. Retention periods and a process for privacy requests have not yet been established. Public contact details are listed below when confirmed.'] },
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    summary: 'How browser storage supports sign-in and remembers your preferences.',
    sections: [
      { title: 'What Pebble uses', paragraphs: ['Cookies and local storage both keep information in your browser. The Pebble app uses local storage for authentication and selected device features; it does not directly set cookies. It currently has no analytics, advertising, or tracking-pixel integrations.'] },
      { title: 'Staying signed in', paragraphs: ['Supabase stores session information, including access and refresh tokens, to keep you signed in and renew your session. Sign-in may also use temporary verification storage. Session duration depends on the authentication settings.', 'Signing out ends the current app session. Clearing site storage removes browser-held tokens but does not delete your account.'] },
      { title: 'Preferences and Community', paragraphs: ['Guest Community progress, including upgrades and object placement, is saved on your device. Matching display preferences are saved when you choose to save them. Older preview preferences may also be read if they remain in your browser.', 'These saved values have no automatic expiry in the app; they remain until cleared or replaced. The marketing and policy pages do not save Community progress or marketing identifiers. Event filters are stored in the page URL, while optional location data is held in memory.'] },
      { title: 'Managing storage', paragraphs: ['Use your browser’s site-data settings to inspect or clear stored information. Blocking authentication storage may prevent sign-in from working reliably. Clearing Community data removes that device’s saved progress; clearing display preferences restores defaults.'] },
      { title: 'Other services', paragraphs: ['Google sign-in, external images, event links, and hosting services may use their own storage. Refer to their privacy and cookie information when using those services. Hosting and third-party storage details still need confirmation.'] },
    ],
  },
}
