import { expect, type Page, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'file-crud' } });
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-admin');
  }, backend);
});

async function openPermissions(page: Page) {
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
  await page
    .getByRole('checkbox', { name: /Select notes/ })
    .locator('..')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage Permissions', exact: true }).click();
  await page.getByLabel('Zone', { exact: true }).fill('sharedzone');
  await expect(page.getByText('No relationships for this file.', { exact: true })).toBeVisible();
}

test('credential UI mints explicit native facts, keeps plaintext in memory and revokes by hash', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Native credentials', exact: true })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('Browser service');
  await page.getByRole('combobox', { name: 'Subject type', exact: true }).selectOption('service');
  await page.getByLabel('Subject ID', { exact: true }).fill('browser-service');
  await page.getByLabel('Zone grants', { exact: false }).fill('sharedzone:r\nother-zone:rw');
  await page.getByLabel('Expiry (optional)', { exact: true }).fill('2099-01-01T00:00');
  await page.getByRole('button', { name: 'Create credential', exact: true }).click();
  const issued = page.getByLabel('New native credential', { exact: true });
  await expect(issued).toHaveAttribute('type', 'password');
  const key = await issued.inputValue();
  expect(key).toMatch(/^sk-fixture-issued-/);
  await page.getByRole('button', { name: 'Show credential', exact: true }).click();
  await expect(issued).toHaveAttribute('type', 'text');
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toContain(key);
  const before = await (await request.get(`${backend}/__fixture/state`)).json();
  const record = before.keys.find((item: { subject_id: string }) => item.subject_id === 'browser-service');
  expect(record).toMatchObject({
    name: 'Browser service',
    subject_type: 'service',
    is_admin: false,
    revoked: false,
    zone_perms: [
      ['sharedzone', 'r'],
      ['other-zone', 'rw'],
    ],
  });
  expect(record.expires_at_ms).toBeGreaterThan(Date.UTC(2098, 11, 30));
  expect(before.calls.find((call: { path: string; method: string }) => call.path === '/v2/auth/keys' && call.method === 'POST').params).toMatchObject({
    subject_type: 'service',
    subject_id: 'browser-service',
    zones: ['sharedzone:r', 'other-zone:rw'],
    admin: false,
    allow_existing: false,
  });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(issued).toHaveCount(0);
  await page.reload();
  await expect(issued).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Browser service', exact: true })).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke Browser service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser service', exact: true })).toHaveCount(0);
  expect((await request.get(`${backend}/v2/auth/whoami`, { headers: { Authorization: `Bearer ${key}` } })).status()).toBe(401);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls).toContainEqual(expect.objectContaining({ path: `/v2/auth/keys/${record.key_hash}`, method: 'DELETE', principal: 'fixture-admin' }));
  expect(calls.some((call: { path: string }) => call.path.startsWith('/api/nfs/'))).toBe(false);
});

for (const [status, body, message] of [
  [503, { error: 'native key store unavailable' }, 'native key store unavailable'],
  [200, {}, 'invalid credential response'],
] as const) {
  test(`credential list ${status} error is visible and cannot appear as an empty list`, async ({ page }) => {
    await page.route(`${backend}/v2/auth/keys`, (route) => route.fulfill({ status, json: body }));
    await page.goto('/admin');
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page.getByText('No credentials found.', { exact: true })).toHaveCount(0);
  });
}

test('invalid mint success does not issue a credential and permits an explicit retry', async ({ page }) => {
  await page.route(`${backend}/v2/auth/keys`, (route) => (route.request().method() === 'POST' ? route.fulfill({ json: {} }) : route.continue()));
  await page.goto('/admin');
  await page.getByLabel('Subject ID', { exact: true }).fill('retry-user');
  await page.getByRole('button', { name: 'Create credential', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'invalid credential response' })).toBeVisible();
  await expect(page.getByLabel('New native credential')).toHaveCount(0);
  await page.unroute(`${backend}/v2/auth/keys`);
  await page.getByRole('button', { name: 'Create credential', exact: true }).click();
  await expect(page.getByLabel('New native credential')).toBeVisible();
});

test('credential revoke failure leaves the record visible for a subsequent retry', async ({ page }) => {
  await page.route(`${backend}/v2/auth/keys/*`, (route) => route.fulfill({ status: 502, body: 'raft store unavailable', contentType: 'text/plain' }));
  await page.goto('/admin');
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke server-alice', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'raft store unavailable' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'server-alice', exact: true })).toBeVisible();
  await page.unroute(`${backend}/v2/auth/keys/*`);
  await page.getByRole('button', { name: 'Revoke server-alice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'server-alice', exact: true })).toHaveCount(0);
});

test('ReBAC UI round trips explicit zone and full userset tuple, including idempotent revocation', async ({ page, request }) => {
  await openPermissions(page);
  await page.getByLabel('Subject type', { exact: true }).fill('group');
  await page.getByLabel('Subject ID', { exact: true }).fill('reviewers');
  await page.getByLabel('Relation', { exact: true }).fill('direct_viewer');
  await page.getByLabel('Subject relation (optional)', { exact: true }).fill('member');
  await page.getByRole('button', { name: 'Grant relationship', exact: true }).click();
  const revoke = page.getByRole('button', { name: 'Revoke group:reviewers direct_viewer', exact: true });
  await expect(revoke).toBeVisible();
  const state = await (await request.get(`${backend}/__fixture/state`)).json();
  const path = state.files.find((file: { path: string }) => file.path.endsWith('.txt')).path;
  const tuple = {
    zone: 'sharedzone',
    object_type: 'file',
    object_id: path,
    relation: 'direct_viewer',
    subject_type: 'group',
    subject_id: 'reviewers',
    subject_relation: 'member',
  };
  expect(state.tuples).toEqual([tuple]);
  expect(state.calls).toContainEqual(expect.objectContaining({ path: '/v2/rebac/tuples', method: 'POST', params: tuple }));
  expect(state.calls).toContainEqual(expect.objectContaining({ path: '/v2/rebac/tuples', method: 'GET', query: { zone: 'sharedzone' } }));
  // Another administrator revokes it while this tab still has the earlier listing.
  expect((await request.delete(`${backend}/v2/rebac/tuples`, { headers: { Authorization: 'Bearer sk-fixture-admin' }, data: tuple })).ok()).toBe(true);
  await revoke.click();
  await expect(revoke).toHaveCount(0);
  await expect(page.getByText('No relationships for this file.', { exact: true })).toBeVisible();
  const after = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(after.calls.filter((call: { method: string; path: string }) => call.method === 'DELETE' && call.path === '/v2/rebac/tuples')).toEqual([
    expect.objectContaining({ params: tuple }),
    expect.objectContaining({ params: tuple }),
  ]);
});

test('ReBAC rejects a successful list response belonging to another zone', async ({ page }) => {
  await page.route(`${backend}/v2/rebac/tuples?zone=*`, (route) =>
    route.fulfill({
      json: {
        tuples: [
          {
            zone: 'another-zone',
            object_type: 'file',
            object_id: '/docs/x',
            relation: 'owner',
            subject_type: 'user',
            subject_id: 'other',
          },
        ],
      },
    }),
  );
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
  await page
    .getByRole('checkbox', { name: /Select notes/ })
    .locator('..')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage Permissions', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'invalid relationship response' })).toBeVisible();
  await expect(page.getByText('No relationships for this file.', { exact: true })).toHaveCount(0);
});

test('non-admin cannot enter management UI or use its native routes', async ({ page, request }) => {
  await page.addInitScript(() => localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice'));
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Access Denied', exact: true })).toBeVisible();
  for (const route of ['/v2/auth/keys', '/v2/rebac/tuples?zone=sharedzone']) {
    expect((await request.get(`${backend}${route}`, { headers: { Authorization: 'Bearer sk-fixture-server-alice' } })).status()).toBe(403);
  }
  await page.getByRole('link', { name: 'Back to files', exact: true }).click();
  await page.getByText('docs', { exact: true }).first().click();
  await page
    .getByRole('checkbox', { name: /Select notes/ })
    .locator('..')
    .click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Manage Permissions', exact: true })).toHaveCount(0);
});
