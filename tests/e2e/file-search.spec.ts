import { expect, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await page.goto('/');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
});

test('file discovery sends the current credential to native glob and grep', async ({ page, request }) => {
  const search = page.getByRole('search', { name: 'File search' });
  await search.getByRole('textbox', { name: 'Search files' }).fill('*.md');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByText('/docs/visible & notes.md', { exact: true })).toBeVisible();
  await expect(search.getByRole('status')).toContainText('More results are available');

  await search.getByRole('button', { name: 'Content', exact: true }).click();
  await search.getByRole('textbox', { name: 'Search files' }).fill('needle & 测试');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByText('2 matches', { exact: true })).toBeVisible();
  await expect(search.getByRole('status')).toHaveCount(0);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  const discovery = calls.filter((call: { path: string }) => call.path.startsWith('/v2/search/'));
  expect(discovery.map((call: { path: string; method: string; principal: string }) => [call.path, call.method, call.principal])).toEqual([
    ['/v2/search/glob', 'POST', 'server-alice'],
    ['/v2/search/grep', 'POST', 'server-alice'],
  ]);
  expect(discovery.map((call: { params: unknown }) => call.params)).toEqual([
    { pattern: '*.md', root_path: '/', max_results: 100 },
    { pattern: 'needle & 测试', root_path: '/', max_results: 100 },
  ]);
  expect(calls.some((call: { path: string }) => ['/api/nfs/glob', '/api/nfs/grep'].includes(call.path))).toBe(false);
});

for (const scenario of ['search-unavailable', 'search-application-error']) {
  test(`${scenario} remains an error instead of becoming an empty result`, async ({ page, request }) => {
    await request.post(`${backend}/__fixture/reset`, { data: { scenario } });
    const search = page.getByRole('search', { name: 'File search' });
    await search.getByRole('textbox', { name: 'Search files' }).fill('*.md');
    await search.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(search.getByRole('alert')).toContainText('Search is unavailable');
    await expect(search.getByText('No results found', { exact: true })).toHaveCount(0);
  });
}

test('a successful empty query is distinguishable from a failure', async ({ page }) => {
  const search = page.getByRole('search', { name: 'File search' });
  await search.getByRole('textbox', { name: 'Search files' }).fill('absent');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(search.getByText('No results found', { exact: true })).toBeVisible();
  await expect(search.getByRole('alert')).toHaveCount(0);
});

test('clearing a pending query keeps its late response out of the UI', async ({ page }) => {
  let release!: () => void;
  let received!: () => void;
  const pending = new Promise<void>((resolve) => {
    received = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${backend}/v2/search/glob`, async (route) => {
    received();
    await gate;
    await route.continue();
  });
  const search = page.getByRole('search', { name: 'File search' });
  await search.getByRole('textbox', { name: 'Search files' }).fill('*.md');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await pending;
  await search.getByRole('textbox', { name: 'Search files' }).fill('');
  const response = page.waitForResponse(`${backend}/v2/search/glob`);
  release();
  await (await response).finished();
  await expect(search.getByText('/docs/visible & notes.md', { exact: true })).toHaveCount(0);
  await expect(search.getByText(/result\(s\) found/)).toHaveCount(0);
});
