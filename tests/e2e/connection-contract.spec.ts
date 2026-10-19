import { expect, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ request, context }) => {
  await prepareBrowser(request, context);
});

test('a relative server address never receives account passwords', async ({ page }, testInfo) => {
  const attempted: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/auth/login')) attempted.push(request.url());
  });
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill('wrong-server.example.invalid');
  await page.getByLabel('Email or username', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-not-a-real-credential');
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  try {
    await expect(page.getByRole('alert')).toBeVisible();
    expect(attempted).toEqual([]);
    await expect(page.getByRole('alert')).toContainText('Enter a Nexus server URL');
    expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  } finally {
    await testInfo.attach('attempted-account-endpoints', { body: JSON.stringify(attempted), contentType: 'application/json' });
  }
});

for (const [description, server] of [
  ['scheme-relative', '//wrong-server.example.invalid'],
  ['embedded credentials', 'https://fixture:fake-password@wrong-server.example.invalid'],
  ['query', `${backend}?path=another-service`],
  ['fragment', `${backend}#another-service`],
]) {
  test(`a server URL with ${description} cannot receive credentials`, async ({ page }) => {
    const attempted: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') attempted.push(request.url());
    });
    await page.goto('/login');
    await page.getByLabel('Nexus Server URL').fill(server);
    await page.getByLabel('Email or username', { exact: true }).fill('fixture@example.test');
    await page.getByLabel('Password', { exact: true }).fill('fixture-password-not-a-real-credential');
    await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a Nexus server URL');
    expect(attempted).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  });
}

test('an invalid saved native address returns to login without sending its key', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nexus_api_url', 'wrong-server.example.invalid');
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  });
  const attempted: string[] = [];
  page.on('request', (request) => {
    if (request.headers().authorization) attempted.push(request.url());
  });
  await page.goto('/settings');
  await expect(page).toHaveURL('/login');
  await expect(page.getByLabel('Nexus Server URL')).toHaveValue('wrong-server.example.invalid');
  expect(attempted).toEqual([]);
});

test('an invalid saved account address is discarded without changing the native key', async ({ page }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    sessionStorage.setItem('nexus_account_session', JSON.stringify({ serverUrl: 'wrong-server.example.invalid', token: 'fixture-alice-session' }));
  }, backend);
  const attempted: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/auth/me')) attempted.push(request.url());
  });
  await page.goto('/account');
  await expect(page).toHaveURL('/login');
  expect(attempted).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
});

test('an incomplete HTTP 200 account response cannot establish or replace credentials', async ({ page }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await page.route(`${backend}/auth/login`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'not-a-real-token', user: { is_global_admin: true } }),
    }),
  );
  await page.goto('/login');
  await page.getByLabel('Email or username', { exact: true }).fill('fixture@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password-not-a-real-credential');
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The Nexus server returned an invalid account response.');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
});

test('an HTML fallback cannot authenticate a native connection', async ({ page }) => {
  await page.route(`${backend}/v2/auth/whoami`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Frontend fallback</body></html>' }),
  );
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('API Key', { exact: true }).fill('sk-fixture-server-alice');
  await page.getByRole('button', { name: 'Sign in with API Key', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The Nexus server returned an invalid identity response.');
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBeNull();
});

test('a malformed profile remains an error and leaves native access available', async ({ page }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    sessionStorage.setItem('nexus_account_session', JSON.stringify({ serverUrl: server, token: 'fixture-alice-session' }));
  }, backend);
  await page.route(`${backend}/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_global_admin: true }) }),
  );
  await page.goto('/account');
  await expect(page.getByRole('alert')).toContainText('The Nexus server returned an invalid account response.');
  await expect(page.getByRole('heading', { name: 'Your Nexus account' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  await page.getByRole('link', { name: 'Change account connection', exact: true }).click();
  await expect(page).toHaveURL('/login');
});

test('an HTTP 200 registration fallback cannot claim account creation or request mail', async ({ page, request }) => {
  await page.route(`${backend}/auth/register`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Frontend fallback</body></html>' }),
  );
  await page.goto('/register');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('Email', { exact: false }).fill('fixture@example.test');
  await page.locator('#password').fill('fixture-password-not-a-real-credential');
  await page.locator('#confirmPassword').fill('fixture-password-not-a-real-credential');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The Nexus server returned an invalid account response.');
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toHaveCount(0);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path === '/auth/request-verification')).toBe(false);
});
