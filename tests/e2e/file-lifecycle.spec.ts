import { type APIRequestContext, expect, type Page, test } from '@playwright/test';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'file-crud' } });
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
});

async function write(request: APIRequestContext, name: string, content: string) {
  expect(
    (
      await request.put(`${backend}/v2/files?path=${encodeURIComponent(`/docs/${name}`)}`, {
        data: Buffer.from(content),
        headers: { Authorization: 'Bearer sk-fixture-server-alice', 'Content-Type': 'application/octet-stream' },
      })
    ).ok(),
  ).toBe(true);
}

async function open(page: Page, name: string) {
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
  await page.getByText(name, { exact: true }).first().click();
}

for (const fail of [false, true]) {
  test(`late save ${fail ? 'failure' : 'success'} cannot replace a new file's draft`, async ({ page, request }) => {
    await write(request, 'old.txt', 'old content');
    await write(request, 'new.txt', 'new content');
    let release!: () => void;
    let received!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      received = resolve;
    });
    await page.route(`${backend}/v2/files?*`, async (route) => {
      if (route.request().method() !== 'PUT' || new URL(route.request().url()).searchParams.get('path') !== '/docs/old.txt') return route.continue();
      const response = fail ? undefined : await route.fetch();
      received();
      await gate;
      if (fail) await route.fulfill({ status: 503, json: { error: 'old save failed' } });
      else await route.fulfill({ response });
    });
    try {
      await open(page, 'old.txt');
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByPlaceholder('Enter text content...').fill('old saved');
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await pending;
      await page.getByText('new.txt', { exact: true }).first().click();
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
      await page.getByPlaceholder('Enter text content...').fill('keep this new draft');
      release();
      await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
      await expect(page.getByPlaceholder('Enter text content...')).toHaveValue('keep this new draft');
      await expect(page.getByRole('alert').filter({ hasText: 'old save failed' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await expect(page.getByText('keep this new draft', { exact: true })).toBeVisible();
    } finally {
      release();
    }
  });
}

test('late delete cannot clear a subsequently selected file', async ({ page, request }) => {
  await write(request, 'old.txt', 'old content');
  await write(request, 'new.txt', 'new content');
  let release!: () => void;
  let received!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    received = resolve;
  });
  await page.route(`${backend}/v2/files?*`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    const response = await route.fetch();
    received();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await open(page, 'old.txt');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await pending;
    await page.getByText('new.txt', { exact: true }).first().click();
    await expect(page.getByText('new content', { exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('checkbox', { name: 'Select old.txt', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'new.txt', exact: true })).toBeVisible();
    await expect(page.getByText('new content', { exact: true })).toBeVisible();
  } finally {
    release();
  }
});

test('bulk delete sends one recursive request for a selected ancestor and clears its preview', async ({ page, request }) => {
  await write(request, 'child.txt', 'child content');
  await open(page, 'child.txt');
  await page.getByRole('checkbox', { name: 'Select docs', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select child.txt', exact: true }).check();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete selected', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Select docs', exact: true })).toHaveCount(0);
  await expect(page.getByText('Select a file to preview its content.', { exact: true })).toBeVisible();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { method: string }) => call.method === 'DELETE')).toEqual([
    expect.objectContaining({ path: '/v2/files', query: { path: '/docs', recursive: 'true' } }),
  ]);
});

test('file navigation and retired routes require only current native contracts', async ({ page, request }) => {
  for (const path of ['/files', '/workspaces', '/memory', '/skills', '/agents', '/integrations']) {
    await page.goto(path);
    await expect(page.getByText('docs', { exact: true }).first()).toBeVisible();
    await page.getByText('docs', { exact: true }).first().click();
    await expect(page.getByRole('checkbox', { name: /Select notes/ })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/files');
  }
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.every((call: { path: string }) => ['/v2/status', '/v2/auth/whoami', '/v2/directories'].includes(call.path))).toBe(true);
  expect(
    calls
      .filter((call: { path: string; query?: { path: string } }) => call.path === '/v2/directories')
      .every((call: { query: { path: string } }) => ['/', '/docs'].includes(call.query.path)),
  ).toBe(true);
});

for (const format of ['html', 'incomplete-json']) {
  test(`${format} HTTP 200 cannot acknowledge a file write or discard its draft`, async ({ page, request }) => {
    await write(request, 'receipt.txt', 'original content');
    await page.route(`${backend}/v2/files?*`, (route) => {
      if (route.request().method() !== 'PUT') return route.continue();
      return format === 'html' ? route.fulfill({ contentType: 'text/html', body: '<html>gateway fallback</html>' }) : route.fulfill({ json: {} });
    });
    await open(page, 'receipt.txt');
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByPlaceholder('Enter text content...').fill('keep this unacknowledged draft');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'invalid file response' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter text content...')).toHaveValue('keep this unacknowledged draft');
    await page.unroute(`${backend}/v2/files?*`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('keep this unacknowledged draft', { exact: true })).toBeVisible();
    const { files } = await (await request.get(`${backend}/__fixture/state`)).json();
    expect(files.find((file: { path: string }) => file.path === '/docs/receipt.txt').base64).toBe(
      Buffer.from('keep this unacknowledged draft').toString('base64'),
    );
  });
}
