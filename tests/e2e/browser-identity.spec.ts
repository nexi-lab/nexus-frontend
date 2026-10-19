import { expect, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test('an API key user can inspect the verified connection and log out from settings', async ({ page }) => {
  await page.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    sessionStorage.setItem('fixture-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Profile & Settings', exact: true })).toBeVisible();
  await expect(page.getByText('server-alice', { exact: true })).toBeVisible();
  await expect(page.getByText(backend, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change Password', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete My Account', exact: true })).toHaveCount(0);
  await expect(page.getByText('sk-fixture-server-alice', { exact: true })).toHaveCount(0);
  await page.getByTitle('Show API key', { exact: true }).click();
  await expect(page.getByText('sk-fixture-server-alice', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBeNull();
});

test.beforeEach(async ({ request, context }) => {
  await prepareBrowser(request, context);
  await context.route('https://accounts.google.com/**', async (route) => {
    const authorization = new URL(route.request().url());
    const redirectUri = authorization.searchParams.get('redirect_uri');
    const state = authorization.searchParams.get('state');
    if (!redirectUri || !state) throw new Error('Authorization URL is missing redirect_uri or state');
    const callback = new URL(redirectUri);
    callback.searchParams.set('state', state);
    callback.searchParams.set('code', 'provider-accepted-code');
    await route.fulfill({ status: 302, headers: { location: callback.href }, body: '' });
  });
});

test('the login page loads less than 1 MiB of JavaScript', async ({ page }) => {
  const scripts: Promise<number>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response.body().then((body) => body.byteLength));
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in to Nexus' })).toBeVisible();
  const sizes = await Promise.all(scripts);
  expect(sizes.length).toBeGreaterThan(0);
  expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThan(1024 * 1024);
});

test('Google uses the selected account server and preserves the native connection', async ({ page, request }) => {
  await page.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    sessionStorage.setItem('fixture-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-previous');
    localStorage.setItem('nexus_user_info', JSON.stringify({ is_admin: true, user: 'forged-user' }));
  }, backend);
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill(`${backend}/`);
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByText('alice@example.test', { exact: true })).toBeVisible();
  const saved = await page.evaluate(() => ({
    nativeServer: localStorage.getItem('nexus_api_url'),
    nativeKey: localStorage.getItem('nexus_api_key'),
    cachedIdentity: localStorage.getItem('nexus_user_info'),
    session: JSON.parse(sessionStorage.getItem('nexus_account_session') || '{}'),
    attempt: sessionStorage.getItem('nexus_google_login'),
  }));
  expect(saved.nativeServer).toBe(backend);
  expect(saved.nativeKey).toBe('sk-fixture-previous');
  expect(saved.cachedIdentity).toBeNull();
  expect(saved.session).toEqual({ serverUrl: `${backend}/`, token: 'fixture-alice-session' });
  expect(saved.attempt).toBeNull();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  const accountCalls = calls.filter((call: { path: string }) => call.path.startsWith('/auth/'));
  expect(accountCalls.map((call: { path: string }) => call.path)).toEqual(['/auth/oauth/google/authorize', '/auth/oauth/google/callback']);
  expect(accountCalls.every((call: { authorized: boolean }) => !call.authorized)).toBe(true);
  expect(
    calls.filter((call: { path: string }) => call.path === '/v2/auth/whoami').every((call: { principal: string }) => call.principal === 'previous-user'),
  ).toBe(true);
});

test('a Google account without native credentials can manage its profile and cannot open files', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(page.getByRole('heading', { name: 'Your Nexus account' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change Password', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('alice@example.test', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(page).toHaveURL('/login');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path.startsWith('/v2/'))).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBeNull();
});

test('a callback without its browser binding cannot establish credentials', async ({ page, context, request }) => {
  await context.route('https://accounts.google.com/**', async (route) => {
    await context.clearCookies();
    await route.fallback();
  });
  await page.goto('/login');
  await page.locator('#apiUrl').fill(backend);
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page.getByText(/Failed to sign in: provider or browser binding rejected/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nexus_jwt_token'))).toBeNull();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.find((call: { path: string }) => call.path === '/auth/oauth/google/callback').browserBound).toBe(false);
});

test('a cached account cannot grant administrator access', async ({ page }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    localStorage.setItem('nexus_jwt_token', 'fixture-alice-session');
    localStorage.setItem('nexus_user_account', JSON.stringify({ user_id: 'forged-user', api_key: 'sk-fixture-previous', is_global_admin: true }));
    localStorage.setItem('nexus_user_info', JSON.stringify({ is_admin: true, user: 'operator' }));
  }, backend);
  await page.goto('/admin');
  await expect(page.getByText('Verifying your Nexus connection...')).toBeHidden();
  await expect(page.getByText(/Access Denied/).first()).toBeVisible();
});

for (const scenario of ['unconfigured', 'malformed', 'rejected']) {
  test(`Google ${scenario} response cannot establish a Nexus identity`, async ({ page, request }) => {
    await request.post(`${backend}/__fixture/reset`, { data: { scenario } });
    await page.goto('/login');
    await page.locator('#apiUrl').fill(backend);
    await page.getByRole('button', { name: 'Google', exact: true }).click();
    if (scenario === 'rejected') {
      await expect(page.getByText(/Failed to sign in|provider or browser binding rejected/).first()).toBeVisible();
    } else {
      await expect(page.getByRole('alert')).toBeVisible();
    }
    const credentials = await page.evaluate(() => [
      localStorage.getItem('nexus_api_key'),
      sessionStorage.getItem('nexus_account_session'),
      sessionStorage.getItem('nexus_google_login'),
    ]);
    expect(credentials).toEqual([null, null, null]);
    const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
    expect(calls.some((call: { path: string }) => call.path === '/v2/auth/whoami')).toBe(false);
  });
}

test('a callback with another state never reaches the authentication backend', async ({ page, request }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    sessionStorage.setItem('nexus_google_login', JSON.stringify({ serverUrl: server, state: 'expected-state' }));
  }, backend);
  await page.goto('/oauth/callback?code=untrusted-code&state=another-state');
  await expect(page.getByText(/The sign-in state does not match this browser/)).toBeVisible();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path.startsWith('/auth/oauth/'))).toBe(false);
});

test('an integration callback keeps the current Nexus identity and leaves no persistent callback state', async ({ page, request }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    sessionStorage.setItem('oauth_state', 'integration-state');
    sessionStorage.setItem('oauth_provider', 'gdrive');
  }, backend);
  await page.goto('/oauth/callback?code=integration-code&state=integration-state');
  await expect(page).toHaveURL(/\/integration$/);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path === '/api/nfs/oauth_exchange_code')).toHaveLength(1);
  expect(calls.find((call: { path: string }) => call.path === '/api/nfs/oauth_exchange_code').principal).toBe('server-alice');
  const saved = await page.evaluate(() => ({
    key: localStorage.getItem('nexus_api_key'),
    state: sessionStorage.getItem('oauth_state'),
    provider: sessionStorage.getItem('oauth_provider'),
    debug: localStorage.getItem('nexus_last_oauth_debug'),
    error: localStorage.getItem('nexus_last_oauth_error'),
  }));
  expect(saved).toEqual({ key: 'sk-fixture-server-alice', state: null, provider: null, debug: null, error: null });
});

test('an integration callback with another state cannot exchange a code', async ({ page, request }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    sessionStorage.setItem('oauth_state', 'integration-state');
    sessionStorage.setItem('oauth_provider', 'gdrive');
  }, backend);
  await page.goto('/oauth/callback?code=integration-code&state=untrusted-state');
  await expect(page.getByRole('alert')).toContainText('state does not match');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path === '/api/nfs/oauth_exchange_code')).toBe(false);
});

test('a revoked saved credential clears authentication and ignores cached administrator flags', async ({ page, request }) => {
  await page.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    sessionStorage.setItem('fixture-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-revoked');
    localStorage.setItem('nexus_user_info', JSON.stringify({ is_admin: true, user: 'operator' }));
  }, backend);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBeNull();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path === '/v2/auth/whoami')).toBe(true);
});
