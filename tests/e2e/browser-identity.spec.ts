import { expect, test } from '@playwright/test';

const backend = 'http://127.0.0.1:4181';

test.beforeEach(async ({ request, context }) => {
  await request.post(`${backend}/__fixture/reset`, { data: {} });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173' || url.origin === backend) await route.continue();
    else await route.abort('blockedbyclient');
  });
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

test('Google login uses the selected backend and replaces the old credential', async ({ page, request }) => {
  await page.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    sessionStorage.setItem('fixture-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-previous');
    localStorage.setItem('nexus_user_info', JSON.stringify({ is_admin: true, user: 'forged-user' }));
  }, backend);
  await page.goto('/login');
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect
    .poll(async () =>
      (await (await request.get(`${backend}/__fixture/state`)).json()).calls.some(
        (call: { path: string; principal: string }) => call.path === '/v2/auth/whoami' && call.principal === 'server-alice',
      ),
    )
    .toBe(true);
  const saved = await page.evaluate(() => ({
    previousKey: localStorage.getItem('nexus_api_key'),
    cachedIdentity: localStorage.getItem('nexus_user_info'),
    account: JSON.parse(localStorage.getItem('nexus_user_account') || '{}'),
  }));
  expect(saved.previousKey).toBeNull();
  expect(saved.cachedIdentity).toBeNull();
  expect(saved.account.user_id).toBe('server-alice');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.find((call: { path: string }) => call.path === '/auth/oauth/google/authorize').authorized).toBe(false);
  expect(calls.filter((call: { path: string }) => call.path === '/auth/oauth/check')).toHaveLength(1);
  expect(calls.find((call: { path: string }) => call.path === '/auth/oauth/check').authorized).toBe(false);
});

test('a new Google user confirms account information before receiving credentials', async ({ page, request }) => {
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'new' } });
  await page.goto('/login');
  await page.locator('#apiUrl').fill(backend);
  await page.getByRole('button', { name: 'Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm Your Information' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nexus_jwt_token'))).toBeNull();
  await page.getByLabel('Organization Slug').fill('alice-space');
  await page.getByRole('button', { name: 'Confirm and Continue' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path === '/auth/oauth/confirm')).toHaveLength(1);
  expect(calls.find((call: { path: string }) => call.path === '/auth/oauth/confirm').authorized).toBe(false);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('nexus_user_account') || '{}').user_id)).toBe('server-alice');
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
  expect(calls.find((call: { path: string }) => call.path === '/auth/oauth/check').browserBound).toBe(false);
});

test('a cached account cannot grant administrator access', async ({ page }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_jwt_token', 'fixture-alice-session');
    localStorage.setItem('nexus_user_account', JSON.stringify({ user_id: 'server-alice', api_key: 'sk-fixture-server-alice', is_global_admin: true }));
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
    const credentials = await page.evaluate(() => [localStorage.getItem('nexus_api_key'), localStorage.getItem('nexus_jwt_token')]);
    expect(credentials).toEqual([null, null]);
    const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
    expect(calls.some((call: { path: string }) => call.path === '/v2/auth/whoami')).toBe(false);
  });
}

test('a callback with another state never reaches the authentication backend', async ({ page, request }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    sessionStorage.setItem('oauth_state', 'expected-state');
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
