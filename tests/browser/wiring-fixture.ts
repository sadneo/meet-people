import type { Page } from "@playwright/test";
import { browserAccount, mockMatchingSession } from "./matchmaking-fixture";
import { effectiveDetailedSettings } from "../../shared/detailed-settings";
import { emptyAccount } from "../../shared/account";
import { emptyDatingProfile } from "../../shared/dating";

export const user = "a0000000-0000-4000-8000-000000000001";
export const peer = "a0000000-0000-4000-8000-000000000002";
export const conversationId = "c0000000-0000-4000-8000-000000000001";
export const eventId = "e0000000-0000-4000-8000-000000000001";
export const locationId = "f0000000-0000-4000-8000-000000000001";
const now = "2026-10-27T12:00:00Z";
export async function wiringFixture(
  page: Page,
  options: {
    guest?: boolean;
    fresh?: boolean;
    incomplete?: boolean;
    queue?: "downtime";
    lostMessage?: boolean;
  } = {},
) {
  let account = browserAccount(),
    mode: string | null = options.queue ?? null;
  if (options.incomplete)
    account = {
      ...account,
      profile: {
        ...account.profile!,
        interests: [],
        birthdate: null,
        location_city: null,
        availability: [],
      },
      preferences: { intents: [], usual: [], distance: "", group: "" },
      completed: [0],
    };
  if (options.fresh) account = structuredClone(emptyAccount);
  let photoRevision = 0,
    hasPhoto = false;
  let connection = "none",
    blocked = false,
    friendRevision = 0,
    friends: unknown = null;
  let facts = {
    revision: 0,
    facts: {
      education: "",
      occupation: "",
      languages: [] as string[],
      visibility: { education: false, occupation: false, languages: false },
    },
  };
  let detailed = {
    revision: 1,
    settings: {
      messages: true,
      plans: false,
      matches: false,
      friendsDiscovery: true,
      datingDiscovery: true,
    },
  };
  let dating = {
    profileRevision: 1,
    searchRevision: 1,
    profile: {
      ...emptyDatingProfile(),
      gender: "Man",
      sexuality: "Straight",
      clarifiedTargets: ["Woman"],
      intent: "Long-term relationship",
      style: "Monogamy",
    },
    search: {
      ageMin: 18,
      ageMax: 99,
      radiusMiles: 15,
      searchArea: { source: "home", resolvedLocationRef: locationId },
    },
    eligibility: { asOf: "2026-10-27", adult: true, locationResolved: true },
    effectiveEnabled: false,
  };
  const messages = [
    {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      seq: 1,
      sender_id: peer,
      body: "A real saved hello",
      created_at: now,
    },
  ];
  const sent = new Map<string, (typeof messages)[number]>();
  const calls: {
    path: string;
    method: string;
    body: unknown;
    token: string | undefined;
  }[] = [];
  let droppedMessage = false;
  await page.route("**/api/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname,
      method = request.method(),
      body =
        request.postData() &&
        request.headers()["content-type"]?.includes("application/json")
          ? request.postDataJSON()
          : null;
    calls.push({ path, method, body, token: request.headers().authorization });
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ json, status });
    if (path === "/api/auth/email") return reply({ exists: true });
    if (path.endsWith("/account")) {
      if (method === "PUT") account = body;
      return reply(account);
    }
    if (path.endsWith("/account-profile"))
      return reply({
        profile: {
          username: account.profile!.username,
          display_name: account.profile!.display_name,
          bio: account.profile!.bio,
          avatar_url: null,
        },
      });
    if (path.endsWith("/profile")) return reply({ profile: account.profile });
    if (path.endsWith("/profile-details")) {
      if (method === "PUT")
        facts = { revision: facts.revision + 1, facts: body.facts };
      return reply(facts);
    }
    if (path.endsWith("/profile-photo")) {
      if (method === "PUT" || method === "DELETE") {
        photoRevision++;
        hasPhoto = method === "PUT";
      }
      return reply({
        revision: photoRevision,
        hasPhoto,
        updatedAt: photoRevision ? now : null,
      });
    }
    if (path.includes("/profile-photo/reference/"))
      return reply({ revision: 0, hasPhoto: false, updatedAt: null });
    if (path.includes("/profile-photo/"))
      return route.fulfill({
        contentType: "image/jpeg",
        body: Buffer.from(
          "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdAB//2Q==",
          "base64",
        ),
      });
    if (path.endsWith("/detailed-settings")) {
      if (method === "PUT")
        detailed = { revision: detailed.revision + 1, settings: body.settings };
      const masters = {
        notifications: account.settings.notifications,
        discoverable: account.settings.discoverable,
      };
      return reply({
        ...detailed,
        masters,
        effective: effectiveDetailedSettings(detailed.settings, masters),
      });
    }
    if (path.endsWith("/friends-search-preferences/runtime"))
      return reply({
        available: true,
        policy: "nearby-first-v1",
        canJoin: true,
      });
    if (path.endsWith("/friends-search-preferences")) {
      if (method === "PUT") {
        friendRevision++;
        friends = body.preferences;
      }
      return reply({ revision: friendRevision, preferences: friends });
    }
    if (path.endsWith("/search-locations/places"))
      return reply({
        places: [
          {
            id: locationId,
            label: "Stony Brook University",
            region: "New York",
          },
        ],
      });
    if (
      path.endsWith("/search-locations/resolve") ||
      path.includes("/search-locations/friends/") ||
      path.includes("/search-locations/dating/")
    )
      return reply({
        id: locationId,
        mode:
          path.includes("/dating/") || body?.mode === "dating"
            ? "dating"
            : "friends",
        source: body?.source ?? "home",
        areaLabel: "Stony Brook University",
        method: "geocoded-area",
        expiresAt: "2099-01-01T00:00:00Z",
        usable: true,
      });
    if (path.endsWith("/dating-preferences")) {
      if (method === "PUT")
        dating = {
          ...dating,
          profileRevision: dating.profileRevision + 1,
          searchRevision: dating.searchRevision + 1,
          profile: body.profile,
          search: body.search,
        };
      return reply(dating);
    }
    if (path.endsWith("/dating/status") || path.endsWith("/dating/enabled")) {
      if (method === "PUT")
        dating = {
          ...dating,
          profileRevision: dating.profileRevision + 1,
          searchRevision: dating.searchRevision + 1,
          profile: { ...dating.profile, enabled: body.enabled },
          effectiveEnabled: body.enabled,
        };
      return reply({
        available: true,
        aggregate: dating,
        canStart: true,
        globalDiscovery: true,
        datingDiscovery: true,
      });
    }
    if (path.endsWith('/schedule')) return reply({revision:1,timeZone:'America/New_York',showAvailability:false});
    if (path.endsWith('/active-friends/groups')) return reply({groups:[]});
    if (path.endsWith('/active-friends/status')) return reply({enabled:true,state:'idle',entryId:null,queuedAt:null,proposal:null,groupId:null});
    if (path.endsWith('/friends/recommendations') || path.endsWith('/dating/recommendations')) {
      const isDating=path.includes('/dating/');
      return reply({algorithmVersion:isDating?'dating-rules-v1':'friends-rules-v1',candidates:body.excludedIds.includes(peer)?[]:[{
        id:peer,name:'Taylor',age:23,city:'Stony Brook',bio:'Coffee after class?',avatar:null,photoRevision:0,interests:['Coffee'],areaDistanceMiles:2,
        ...(isDating?{heightInches:null,gender:null,sexuality:null,intent:'Long-term relationship',style:'Monogamy'}:{})
      }]});
    }
    if (path.includes('/friends/requests/')) return reply({status:'sent',conversationId:null});
    if (path.endsWith("/dating/candidate"))
      return reply({
        candidate: {
          id: peer,
          name: "Taylor",
          age: 23,
          city: "Stony Brook",
          bio: "Coffee after class?",
          avatar: null,
          photoRevision: 0,
          interests: ["Coffee"],
          areaDistanceMiles: 2,
          heightInches: null,
          gender: null,
          sexuality: null,
          intent: "Long-term relationship",
          style: "Monogamy",
        },
      });
    if (path.includes("/dating/requests/")) {
      connection = "sent";
      return reply({ status: connection, conversationId: null });
    }
    if (path.endsWith("/matchmaking/status")) return reply({ mode });
    if (path.endsWith("/queue")) {
      mode = method === "POST" ? body.mode : null;
      return reply({ mode });
    }
    if (path.endsWith("/result"))
      return reply({
        candidate: {
          id: peer,
          name: "Taylor",
          avatar: null,
          interests: ["Coffee"],
          overlap: "some",
          mode: "active",
          meetup: null,
        },
      });
    if (path.endsWith("/notifications"))
      return reply({ notifications: [], unreadCount: 0 });
    if (path.endsWith("/group-queue"))
      return reply({ state: "idle", proposal: null });
    if (path === "/api/events")
      return reply({
        events: [
          {
            id: eventId,
            title: "Campus coffee walk",
            description: "Meet at the library.",
            category: "Outdoors",
            starts_at: "2026-11-03T17:00:00Z",
            ends_at: null,
            location_name: "Library",
            address: null,
            city: "Stony Brook",
            image_url: null,
            source: "Campus",
            source_url: "https://example.test/event",
            status: "active",
            distance_miles: null,
            interested_count: 0,
          },
        ],
        categories: ["Outdoors"],
        page: 1,
        hasMore: false,
      });
    if (path === `/api/events/${eventId}`)
      return reply({
        id: eventId,
        title: "Campus coffee walk",
        description: "Meet at the library.",
        category: "Outdoors",
        starts_at: "2026-11-03T17:00:00Z",
        ends_at: null,
        location_name: "Library",
        address: null,
        city: "Stony Brook",
        image_url: null,
        source: "Campus",
        source_url: null,
        status: "active",
        distance_miles: null,
        interested_count: 0,
      });
    if (path === "/api/connections")
      return reply({ incoming: [], sent: [], connected: [] });
    if (path.startsWith("/api/connections/")) {
      if (method === "POST") connection = "sent";
      return reply({ status: connection, conversationId: null });
    }
    if (path === "/api/conversations/activity")
      return reply({ incomingRequests: 0, unreadConversations: 1 });
    const participants = [
      { id: user, display_name: "Sam", avatar_url: null, last_read_seq: 0 },
      { id: peer, display_name: "Taylor", avatar_url: null, last_read_seq: 0 },
    ];
    if (path === "/api/conversations")
      return reply({
        conversations: [
          {
            id: conversationId,
            kind: "direct",
            created_at: now,
            participants,
            latest_message: messages.at(-1),
            unread_count: 1,
          },
        ],
        hasMore: false,
      });
    if (path.endsWith("/messages")) {
      if (method === "POST") {
        let saved = sent.get(body.clientRequestId);
        if (!saved) {
          saved = {
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            seq: messages.length + 1,
            sender_id: user,
            body: body.body,
            created_at: now,
          };
          sent.set(body.clientRequestId, saved);
          messages.push(saved);
        }
        if (options.lostMessage && !droppedMessage) {
          droppedMessage = true;
          return route.abort();
        }
        return reply(saved);
      }
      return reply({
        kind: "direct",
        canSend: true,
        participants,
        messages,
        nextCursor: null,
      });
    }
    if (path.endsWith("/read")) return reply({ lastReadSeq: body.seq });
    if (path.endsWith('/safety/reports') && method === 'POST') return reply({ id: 'd0000000-0000-4000-8000-000000000001', requestId: body.requestId, targetId: body.targetId, receivedAt: now, status: 'received' });
    if (path.endsWith("/safety/blocks"))
      return reply({
        enforcement: "contact-mutations-only",
        blocks: blocked
          ? [{ targetId: peer, displayName: null, blockedAt: now }]
          : [],
      });
    if (path.includes("/safety/blocks/")) {
      if (method === "PUT") blocked = true;
      if (method === "DELETE") blocked = false;
      return reply({
        targetId: peer,
        outgoingBlocked: blocked,
        enforcement: "contact-mutations-only",
      });
    }
    return reply(
      { code: "unavailable", error: "Service unavailable in test." },
      503,
    );
  });
  await mockMatchingSession(page, !options.guest);
  return { calls, sent, getAccount: () => account };
}
