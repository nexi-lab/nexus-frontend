import { expect, test } from '@playwright/test';
import NexusAPIClient from '../../src/api/client';
import { createFilesAPI } from '../../src/api/files';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ page, request, context }) => {
  await prepareBrowser(request, context);
  await request.post(`${backend}/__fixture/reset`, { data: { scenario: 'file-crud' } });
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
});

test('browse, edit, rename and delete use native files and keep the selected path current', async ({ page, request }) => {
  const name = 'notes & 测试.txt';
  await page.getByText(name, { exact: true }).first().click();
  await expect(page.getByText('{"error":"actual file content"}', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByPlaceholder('Enter text content...').fill('edited ✓ & 中文');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('edited ✓ & 中文', { exact: true })).toBeVisible();

  await page.getByText(name, { exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByPlaceholder('Enter new name').fill('renamed & 测试.txt');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByPlaceholder('Enter text content...').fill('saved after rename');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('saved after rename', { exact: true })).toBeVisible();
  const { files, calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(files.some((file: { path: string }) => file.path === `/docs/${name}`)).toBe(false);
  expect(files.find((file: { path: string }) => file.path === '/docs/renamed & 测试.txt').base64).toBe(Buffer.from('saved after rename').toString('base64'));
  const operations = calls.filter((call: { path: string }) => call.path.startsWith('/v2/files') || call.path === '/v2/directories');
  expect(operations.every((call: { principal: string }) => call.principal === 'server-alice')).toBe(true);
  expect(calls.some((call: { path: string }) => /^\/api\/nfs\/(list|read|write|rename|delete|exists|is_directory|mkdir|rmdir)$/.test(call.path))).toBe(false);

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('renamed & 测试.txt', { exact: true })).toHaveCount(0);
});

test('create a directory and file then delete the populated directory recursively', async ({ page, request }) => {
  await page.getByRole('checkbox', { name: 'Select docs', exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
  await page.getByPlaceholder('folder name').fill('created & 测试');
  await page.getByPlaceholder('folder name').press('Enter');
  const folder = page.getByText('created & 测试', { exact: true }).first();
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New File', exact: true }).click();
  await page.getByPlaceholder('file name').fill('empty.txt');
  await page.getByPlaceholder('file name').press('Enter');
  await expect(page.getByText('empty.txt', { exact: true }).first()).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(folder).toHaveCount(0);
  const { files, calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(files.some((file: { path: string }) => file.path.startsWith('/docs/created & 测试'))).toBe(false);
  expect(calls.some((call: { method: string; query?: { recursive: string } }) => call.method === 'DELETE' && call.query?.recursive === 'true')).toBe(true);
});

test('binary upload and download preserve every byte with raw HTTP bodies', async ({ page, request }) => {
  const bytes = Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256));
  await page.getByRole('checkbox', { name: 'Select docs', exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Upload Files', exact: true }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'bytes & 测试.bin', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('button', { name: 'Upload (1 file)', exact: true }).click();
  await expect(page.getByText('bytes & 测试.bin', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByText('bytes & 测试.bin', { exact: true }).first().click({ button: 'right' });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  if (!stream) throw new Error('Download did not provide a readable stream');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks)).toEqual(bytes);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  const writes = calls.filter((call: { method: string }) => call.method === 'PUT');
  expect(writes).toEqual([
    expect.objectContaining({ path: '/v2/files', principal: 'server-alice', bytes: bytes.length, contentType: 'application/octet-stream' }),
  ]);
});

for (const [scenario, message] of [
  ['files-unavailable', 'VFS is unavailable'],
  ['files-forbidden', 'File access is forbidden'],
]) {
  test(`${scenario} remains a visible file read error`, async ({ page, request }) => {
    await request.post(`${backend}/__fixture/reset`, { data: { scenario } });
    await page.getByText('notes & 测试.txt', { exact: true }).first().click();
    await expect(page.getByText('Failed to load file', { exact: true })).toBeVisible();
    await expect(page.getByText(message, { exact: true }).last()).toBeVisible();
  });
}

test('metadata helpers distinguish missing entries from denied and unavailable requests', async ({ request }) => {
  const files = createFilesAPI(new NexusAPIClient(backend, 'sk-fixture-server-alice'));
  await expect(files.exists('/missing')).resolves.toBe(false);
  await expect(files.isDirectory('/missing')).resolves.toBe(false);
  await expect(files.isDirectory('/docs')).resolves.toBe(true);
  for (const [scenario, status] of [
    ['files-forbidden', 403],
    ['files-unavailable', 503],
  ] as const) {
    await request.post(`${backend}/__fixture/reset`, { data: { scenario } });
    await expect(files.exists('/docs')).rejects.toMatchObject({ status });
    await expect(files.isDirectory('/docs')).rejects.toMatchObject({ status });
  }
});
