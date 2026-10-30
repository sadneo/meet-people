import { expect, test } from "@playwright/test";
import { conversationId, peer, wiringFixture } from "./wiring-fixture";
import { mockLocationPicker } from './location-picker-fixture';

test("public entry and private routes use the new frontend with real sign-in gates", async ({
  page,
}) => {
  await wiringFixture(page, { guest: true });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Meet new friends/ }),
  ).toBeVisible();
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(
    page.getByRole("button", { name: "Continue with email", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /sample|simulate/i }),
  ).toHaveCount(0);
});

test("incomplete accounts cannot enter private app screens", async ({
  page,
}) => {
  const fixture = await wiringFixture(page, { incomplete: true });
  await page.goto("/messages");
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Coffee", exact: true }).click();
  await page.getByRole("button", { name: "Art", exact: true }).click();
  await page.getByRole("button", { name: "Gaming", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What brings you here?" }),
  ).toBeVisible();
  expect(fixture.getAccount().profile?.interests).toEqual([
    "Coffee",
    "Art",
    "Gaming",
  ]);
});

test("profile saves use canonical account API and read back persisted data", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto("/profile");
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Jamie");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.profile-summary h3')).toHaveText('Jamie');
  const writes = fixture.calls.filter(
    (call) => call.path.endsWith("/account") && call.method === "PUT",
  );
  expect(writes).toHaveLength(1);
  expect(writes[0].token).toBe("Bearer browser-user-jwt");
});

test("Friends loads passive recommendations without joining an active queue", async ({page}) => {
 const fixture=await wiringFixture(page);
 await page.goto('/matchmaking');
 await expect(page.getByRole('heading',{name:'Taylor, 23'})).toBeVisible();
 await page.getByRole('button',{name:'Connect',exact:true}).click();
 await expect(page.getByText('Request sent to Taylor.')).toBeVisible();
 expect(fixture.calls.some(call=>call.path===`/api/matchmaking/friends/requests/${peer}`&&call.method==='POST')).toBe(true);
 expect(fixture.calls.filter(call=>call.path.endsWith('/queue'))).toHaveLength(0);
});

test("passive discovery leaves a legacy downtime queue alone", async ({page}) => {
 const fixture=await wiringFixture(page,{queue:'downtime'});
 await page.goto('/matchmaking');
 await expect(page.getByRole('heading',{name:'Taylor, 23'})).toBeVisible();
 expect(fixture.calls.filter(call=>call.path.endsWith('/queue'))).toHaveLength(0);
});

test("Friends preferences resolve a server-owned area and save revisioned filters", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await mockLocationPicker(page);
  await page.goto("/matchmaking");
  await page
    .getByRole("button", { name: "Friends preferences", exact: true })
    .click();
  await page.getByRole('button', { name: /Search area.*Campus/ }).click();
  await page.getByRole('combobox', { name: 'Search city or neighborhood' }).fill('Brooklyn');
  await page.getByRole('button', { name: 'Brooklyn, NY', exact: true }).click();
  await page.getByRole('button', { name: 'Set search area', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Search area Brooklyn, NY' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await page.getByRole('slider', { name: 'Minimum age', exact: true }).focus();
  await page.getByRole('slider', { name: 'Minimum age', exact: true }).press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    fixture.calls.some(
      (call) =>
        call.path.endsWith("/friends-search-preferences") &&
        call.method === "PUT",
    ),
  ).toBe(true);
});

test("Dating starts with confirmed consent and uses the live Dating request endpoint", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto("/matchmaking");
  await page.getByRole("button", { name: "Dating", exact: true }).click();
  await page.getByRole("button", { name: "Start Dating discovery" }).click();
  await expect(page.getByRole("heading", { name: "Taylor, 23" })).toBeVisible();
  await page.getByRole("button", { name: "Send Dating request" }).click();
  await expect(page.getByText("Request sent to Taylor.")).toBeVisible();
  expect(
    fixture.calls.some(
      (call) => call.path.endsWith("/dating/enabled") && call.method === "PUT",
    ),
  ).toBe(true);
  expect(
    fixture.calls.some(
      (call) => call.path === `/api/matchmaking/dating/requests/${peer}`,
    ),
  ).toBe(true);
});

test("public events come from the API and private group controls require sign-in", async ({
  page,
}) => {
  await wiringFixture(page, { guest: true });
  await page.goto("/explore");
  await expect(
    page.getByRole("heading", { name: "Campus coffee walk" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Campus coffee walk: see event and people", exact: true }).click();
  await expect(page.getByText("Meet at the library.")).toBeVisible();
  await page.getByRole("link", { name: "Sign in to find a group" }).click();
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});

test("messages load saved history and send with an idempotency key", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto(`/messages/chat?conversation=${conversationId}`);
  await expect(
    page
      .getByLabel("Message history")
      .getByText("A real saved hello", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Message", { exact: true }).fill("Coffee tomorrow?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator(".live-message").filter({ hasText: "Coffee tomorrow?" }),
  ).toHaveCount(1);
  expect(fixture.sent.size).toBe(1);
  await page.reload();
  await expect(
    page.locator(".live-message").filter({ hasText: "Coffee tomorrow?" }),
  ).toHaveCount(1);
});

test("uncertain message delivery retries the same key without a duplicate", async ({
  page,
}) => {
  const fixture = await wiringFixture(page, { lostMessage: true });
  await page.goto(`/messages/chat?conversation=${conversationId}`);
  await page.getByLabel("Message", { exact: true }).fill("A single hello");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Retry same message" }).click();
  await expect(
    page.locator(".live-message").filter({ hasText: "A single hello" }),
  ).toHaveCount(1);
  expect(fixture.sent.size).toBe(1);
  const writes = fixture.calls.filter(
    (call) => call.path.endsWith("/messages") && call.method === "POST",
  );
  expect(writes[0].body).toEqual(writes[1].body);
});

test("safety uses the real block API and confirms before writing", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto(`/messages/chat?conversation=${conversationId}`);
  await page.getByLabel('Conversation options and safety').click();
  await page.getByRole("button", { name: "Block or report" }).click();
  await page
    .getByRole("button", { name: "Block account", exact: true })
    .click();
  expect(
    fixture.calls.filter(
      (call) => call.path.includes("/safety/blocks/") && call.method === "PUT",
    ),
  ).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(()=>fixture.calls.filter(call=>call.path.includes('/safety/blocks/')&&call.method==='PUT').length).toBe(1);
});

test("a backend outage shows a retry state without fixture matches", async ({
  page,
}) => {
  await wiringFixture(page);
  await page.route(
    "**/api/matchmaking/friends/recommendations",
    (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await page.goto("/matchmaking");
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText(/unavailable/i);
  await expect(
    page.getByRole("heading", { name: "Taylor", exact: true }),
  ).toHaveCount(0);
});

for (const width of [320, 800, 1280])
  test(`new frontend fits ${width}px and keeps navigation accessible`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await wiringFixture(page);
    await page.goto("/profile");
    await expect(
      page.getByRole("heading", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/wiring-profile-${width}.png`,
      fullPage: true,
    });
  });

test("garden renders the new canvas, supports local building and cleans up on navigation", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await wiringFixture(page);
  await page.goto("/");
  await expect(page.locator(".garden-canvas")).toBeVisible();
  await page.getByRole("button", { name: /Build with/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Your garden" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Garden inventory" }).click();
  await page.getByRole("link", { name: "Discover", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Discover", exact: true }),
  ).toBeVisible();
  expect(failures).toEqual([]);
});

test("fresh accounts complete every onboarding chapter through persisted writes", async ({
  page,
}) => {
  const fixture = await wiringFixture(page, { fresh: true });
  await page.goto("/profile");
  await page.getByLabel("Username", { exact: true }).fill("jamie");
  await page.getByLabel("Display name", { exact: true }).fill("Jamie");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  for (const name of ["Coffee", "Art", "Gaming"])
    await page.getByRole("button", { name, exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Make friends", { exact: true }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Birthdate · private").fill("2001-01-02");
  await page
    .getByLabel("City or campus area", { exact: true })
    .fill("Stony Brook");
  await page
    .getByRole("combobox", { name: "Distance", exact: true })
    .selectOption("Nearby");
  await page
    .getByRole("combobox", { name: "Group preference", exact: true })
    .selectOption("One-on-one");
  await page.getByRole("button", { name: "Add a time window" }).click();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(
    page.getByRole("heading", { name: "Profile", exact: true }),
  ).toBeVisible();
  expect(fixture.getAccount().completed).toEqual([0, 1, 2, 3]);
  expect(
    fixture.calls.filter(
      (call) => call.path.endsWith("/account") && call.method === "PUT",
    ),
  ).toHaveLength(4);
});

test("email-first sign-in installs the real SDK session before entering the app", async ({
  page,
}) => {
  const fixture = await wiringFixture(page, { guest: true });
  await page.goto("/login");
  await page
    .getByLabel("Email", { exact: true })
    .fill("development-fixture@example.test");
  await page.getByRole("button", { name: "Continue with email", exact: true }).click();
  await page
    .getByLabel("Password", { exact: true })
    .fill("Synthetic-fixture-password-1!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".garden-canvas")).toBeVisible();
  expect(
    fixture.calls.some(
      (call) => call.path === "/api/auth/email" && call.method === "POST",
    ),
  ).toBe(true);
});

test("optional facts save selected language chips and restore them when editing", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto("/profile");
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page.getByRole('combobox', { name: 'Languages', exact: true }).fill('Eng');
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.getByRole('combobox', { name: 'Languages', exact: true }).fill('Fre');
  await page.getByRole('option', { name: 'French', exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit profile', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove English', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove French', exact: true })).toBeVisible();
  await expect
    .poll(
      () =>
        fixture.calls.filter(
          (call) =>
            call.path.endsWith("/profile-details") && call.method === "PUT",
        ).length,
    )
    .toBe(1);
});

test("profile photo uploads binary data through revisioned private storage", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto("/profile");
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  await page
    .getByLabel("Choose a photo")
    .setInputFiles({
      name: "avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aElcAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page.getByRole("button", { name: "Upload photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove photo", exact: true }),
  ).toBeEnabled();
  expect(
    fixture.calls.some(
      (call) => call.path.endsWith("/profile-photo") && call.method === "PUT",
    ),
  ).toBe(true);
});

test("detailed settings persist to their own revisioned resource", async ({
  page,
}) => {
  const fixture = await wiringFixture(page);
  await page.goto("/settings");
  await page.getByRole('link', { name: /^Notifications Messages/ }).click();
  await page.getByRole("switch", { name: "Plan notifications" }).check();
  await page.getByRole('heading', { name: 'Notifications preferences', exact: true }).locator('..').getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByText("Detailed preferences saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Plan notifications" }),
  ).toBeChecked();
  expect(
    fixture.calls.filter(
      (call) =>
        call.path.endsWith("/detailed-settings") && call.method === "PUT",
    ),
  ).toHaveLength(1);
});

test("garden purchases use the new renderer without calling an invented economy API", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const fixture = await wiringFixture(page);
  await page.goto("/");
  await page.getByRole("complementary", {name:"Development navigation"}).locator("summary").click();
  await page.getByRole("button", {name:"Add 1,000 test Pebbles"}).click();
  await page.getByRole("complementary", {name:"Development navigation"}).locator("summary").click();
  await page.getByRole("button", { name: /Build with/ }).click();
  await page
    .locator(".garden-shop-item")
    .filter({ hasText: "Garden Bench" })
    .getByRole("button", { name: "Build", exact: true })
    .click();
  await expect(page.locator(".garden-balance strong")).toHaveText("985");
  await page.getByRole('link', { name: 'Discover', exact: true }).click();
  await page.getByRole('link', { name: 'Garden', exact: true }).click();
  await expect(page.locator('.garden-balance strong')).toHaveText('985');

  expect(
    fixture.calls.some((call) =>
      /economy|reward|garden|purchase/.test(call.path),
    ),
  ).toBe(false);
  expect(errors).toEqual([]);
});


test('reports submit to the real safety contract and show only a received receipt', async ({ page }) => {
  const fixture = await wiringFixture(page);
  await page.goto(`/messages/chat?conversation=${conversationId}`);
  await page.getByLabel('Conversation options and safety').click();
  await page.getByRole('button', { name: 'Block or report' }).click();
  await page.getByLabel('Details (optional)').fill('Unwanted messages.');
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Your report was received.' })).toBeVisible();
  expect(fixture.calls.filter(call => call.path.endsWith('/safety/reports') && call.method === 'POST')).toHaveLength(1);
});
