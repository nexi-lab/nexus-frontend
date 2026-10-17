import { expect, test, type Request } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test('a new credential gets its own file queries and mounted views', async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'cache-isolation' } });
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('API Key', { exact: true }).fill('sk-fixture-server-alice');
  await page.getByRole('button', { name: 'Sign in with API Key' }).click();
  await expect(page.getByText('private-server-alice', { exact: true }).first()).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).toHaveURL('/login');
  await page.getByLabel('API Key', { exact: true }).fill('sk-fixture-previous');
  await page.getByRole('button', { name: 'Sign in with API Key' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('private-server-alice', { exact: true })).toHaveCount(0);
  await expect(page.getByText('private-previous-user', { exact: true }).first()).toBeVisible();
});

test('a response started by the previous credential cannot populate the new connection', async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'cache-isolation' } });
  const isRootList = (request: Request) => {
    const url = new URL(request.url());
    return request.headers().authorization === 'Bearer sk-fixture-server-alice' && (
      (url.pathname === '/api/nfs/list' && request.postDataJSON().params.path === '/') ||
      (url.pathname === '/v2/directories' && url.searchParams.get('path') === '/')
    );
  };
  let received!: () => void;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { received = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route((url) => url.origin === backend && ['/api/nfs/list', '/v2/directories'].includes(url.pathname), async (route) => {
    if (!isRootList(route.request())) return route.continue();
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Nexus Server URL').fill(backend);
    await page.getByLabel('API Key', { exact: true }).fill('sk-fixture-server-alice');
    await page.getByRole('button', { name: 'Sign in with API Key' }).click();
    await pending;
    page.on('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Logout', exact: true }).click();
    await expect(page).toHaveURL('/login');
    await page.getByLabel('API Key', { exact: true }).fill('sk-fixture-previous');
    await page.getByRole('button', { name: 'Sign in with API Key' }).click();
    await expect(page.getByText('private-previous-user', { exact: true }).first()).toBeVisible();
    const late = page.waitForResponse((response) => isRootList(response.request()));
    release();
    await (await late).finished();
    await expect(page.getByText('private-server-alice', { exact: true })).toHaveCount(0);
  } finally {
    release();
  }
});
