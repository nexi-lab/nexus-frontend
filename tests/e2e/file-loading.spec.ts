import { expect, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'file-crud' } });
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
});

test('browsing and reading text loads less than 2 MiB of JavaScript', async ({ page }) => {
  const scripts: Promise<number>[] = [];
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('.js')) scripts.push(response.body().then((body) => body.byteLength));
  });
  const root = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === backend && url.pathname === '/v2/directories' && url.searchParams.get('path') === '/';
  });
  await page.goto('/');
  expect((await root).ok()).toBe(true);
  await page.getByText('docs', { exact: true }).first().click();
  await page.getByText('notes & 测试.txt', { exact: true }).first().click();
  await expect(page.getByText('{"error":"actual file content"}', { exact: true })).toBeVisible();
  const sizes = await Promise.all(scripts);
  expect(sizes.length).toBeGreaterThan(0);
  const bytes = sizes.reduce((total, size) => total + size, 0);
  console.log(`BROWSE TEXT JS: ${bytes} bytes`);
  expect(bytes).toBeLessThan(2 * 1024 * 1024);
});

test('opening a PDF loads its preview and retains malformed-file errors', async ({ page, request }) => {
  const written = await request.put(`${backend}/v2/files?path=${encodeURIComponent('/docs/invalid.pdf')}`, {
    data: Buffer.from('not a PDF'),
    headers: { Authorization: 'Bearer sk-fixture-server-alice', 'Content-Type': 'application/octet-stream' },
  });
  expect(written.ok()).toBe(true);
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
  await page.getByText('invalid.pdf', { exact: true }).first().click();
  await expect(page.getByText(/Failed to load PDF document: Invalid PDF format/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download', exact: true }).first()).toBeVisible();
});
