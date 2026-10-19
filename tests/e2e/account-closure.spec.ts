import { expect, test } from '@playwright/test';
import { accountPassword, createAccount, passwordLogin } from './accounts';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ request, context }) => {
  await prepareBrowser(request, context);
  await context.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-native-seeded')) return;
    sessionStorage.setItem('fixture-native-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
});

test('confirmed deletion removes the Rust account while another account and native files remain available', async ({ page, request }) => {
  const email = await createAccount(request);
  const unrelated = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nexus_account_session') ?? 'null'));
  expect(saved).toMatchObject({ token: expect.any(String) });
  const button = page.getByRole('button', { name: 'Delete account permanently', exact: true });
  await expect(button).toBeDisabled();
  await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(unrelated);
  await expect(button).toBeDisabled();
  await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(email);
  await button.click();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  const facts = await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json();
  expect(facts.users).toEqual([]);
  expect((await request.get(`${backend}/auth/me`, { headers: { Authorization: `Bearer ${saved.token}` } })).status()).toBe(401);
  expect((await request.post(`${backend}/auth/login`, { data: { identifier: email, password: accountPassword } })).status()).toBe(401);
  expect((await request.post(`${backend}/auth/login`, { data: { identifier: unrelated, password: accountPassword } })).status()).toBe(200);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string; method: string }) => call.path === '/auth/me' && call.method === 'DELETE')).toEqual([
    expect.objectContaining({ authorized: true, principal: null }),
  ]);
  expect(calls.some((call: { path: string }) => call.path.startsWith('/api/nfs/'))).toBe(false);
  await page.goto('/files');
  await expect(page).toHaveURL('/files');
});

test('a failed deletion keeps the account session and can be retried against Rust', async ({ page, request }) => {
  const email = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  const session = await page.evaluate(() => sessionStorage.getItem('nexus_account_session'));
  await page.route(`${backend}/auth/me`, (route) =>
    route.request().method() === 'DELETE'
      ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Account store is unavailable' }) })
      : route.continue(),
  );
  await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Account store is unavailable');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBe(session);
  await page.unroute(`${backend}/auth/me`);
  await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect((await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json()).users).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
});

for (const [description, contentType, body] of [
  ['HTML', 'text/html', '<html><body>Frontend fallback</body></html>'],
  ['incomplete JSON', 'application/json', '{}'],
]) {
  test(`a ${description} success reply cannot acknowledge account deletion`, async ({ page, request }) => {
    const email = await createAccount(request);
    await passwordLogin(page, email);
    await expect(page).toHaveURL('/account');
    const session = await page.evaluate(() => sessionStorage.getItem('nexus_account_session'));
    await page.route(`${backend}/auth/me`, (route) =>
      route.request().method() === 'DELETE' ? route.fulfill({ status: 200, contentType, body }) : route.continue(),
    );
    await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('The Nexus server returned an invalid account response.');
    await expect(page).toHaveURL('/account');
    expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBe(session);
    expect((await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json()).users).toHaveLength(1);
    expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  });
}

test('an account deleted by another client rejects mutation and restoration while preserving native access', async ({ page, request }) => {
  const email = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nexus_account_session') ?? 'null'));
  expect(saved).toMatchObject({ token: expect.any(String) });
  expect((await request.delete(`${backend}/auth/me`, { headers: { Authorization: `Bearer ${saved.token}` } })).status()).toBe(200);
  await page.getByLabel('Display name', { exact: true }).fill('late account edit');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Account is unavailable');
  await page.reload();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  await page.goto('/files');
  await expect(page).toHaveURL('/files');
});

test('a previous account deletion response cannot sign out a newly authenticated account', async ({ page, request }) => {
  const email = await createAccount(request);
  const replacement = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  let received!: () => void;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    received = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backend}/auth/me`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    received();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
    await pending;
    await page.getByRole('link', { name: 'Connect to files', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.getByLabel('Nexus Server URL').fill(backend);
    await page.getByLabel('Email or username', { exact: true }).fill(replacement);
    await page.getByLabel('Password', { exact: true }).fill(accountPassword);
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await expect(page.getByText(replacement, { exact: true })).toBeVisible();
    const session = await page.evaluate(() => sessionStorage.getItem('nexus_account_session'));
    const late = page.waitForResponse((response) => response.url() === `${backend}/auth/me` && response.request().method() === 'DELETE');
    release();
    await (await late).finished();
    await expect(page.getByText(replacement, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBe(session);
    expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  } finally {
    release();
  }
});
