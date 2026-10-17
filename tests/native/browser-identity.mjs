import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { preview as startPreview } from 'vite';

const { values } = parseArgs({
  options: {
    'http-url': { type: 'string' },
    'admin-key-file': { type: 'string' },
    'search-fixture': { type: 'string' },
    'output-dir': { type: 'string' },
    'ui-port': { type: 'string', default: '4173' },
  },
});
for (const key of ['http-url', 'admin-key-file', 'search-fixture', 'output-dir']) {
  if (!values[key]) throw new Error(`--${key} is required`);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const uiUrl = `http://127.0.0.1:${values['ui-port']}`;
const nativeUrl = values['http-url'].replace(/\/$/, '');
const output = values['output-dir'];
const admin = (await readFile(values['admin-key-file'], 'utf8')).trim();
const secrets = [admin];
const issued = [];
const grants = [];
const checks = [];
const fileRoot = `/browser-files-${randomUUID()}`;
let createdFiles = false;
let browser;
let page;
let preview;
let failure;

async function adminRequest(path, options = {}) {
  const response = await fetch(`${nativeUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}`, ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`native administrator request ${path} failed: ${response.status}: ${await response.text()}`);
  return response;
}

try {
  await mkdir(output, { recursive: true });
  const fixture = JSON.parse(await readFile(values['search-fixture'], 'utf8'));
  secrets.push(fixture.readerKey);
  assert.equal(fixture.url, nativeUrl);
  assert.equal(typeof fixture.subject, 'string');
  for (const name of ['alice', 'bob']) {
    const response = await adminRequest('/v2/auth/keys', {
      method: 'POST',
      body: JSON.stringify({
        subject_type: 'user',
        subject_id: `browser-${name}`,
        name: `Browser acceptance ${name}`,
        zones: ['sharedzone:r'],
      }),
    });
    const credential = await response.json();
    assert.equal(typeof credential.key, 'string');
    assert.equal(typeof credential.key_hash, 'string');
    secrets.push(credential.key);
    issued.push(credential);
  }
  preview = await startPreview({ root, preview: { host: '127.0.0.1', port: Number(values['ui-port']), strictPort: true } });
  browser = await chromium.launch({ headless: true, ...(process.env.NEXUS_TEST_CHROME ? { executablePath: process.env.NEXUS_TEST_CHROME } : {}) });
  page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === uiUrl || origin === nativeUrl) await route.continue();
    else await route.abort('blockedbyclient');
  });
  page.setDefaultTimeout(15000);
  const login = async (credential, subject) => {
    await page.goto(`${uiUrl}/login`);
    await page.getByLabel('Nexus Server URL').fill(nativeUrl);
    await page.getByLabel('API Key', { exact: true }).fill(credential.key);
    const responsePromise = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/auth/whoami` && response.request().method() === 'GET');
    await page.getByRole('button', { name: 'Sign in with API Key' }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['access-control-allow-origin'], uiUrl);
    const identity = await response.json();
    assert.equal(identity.subject_id, subject);
    assert.equal(identity.is_admin, false);
    await page.waitForURL(`${uiUrl}/`);
    await page.goto(`${uiUrl}/admin`);
    await page.getByRole('heading', { name: 'Access Denied' }).waitFor();
  };

  await login(issued[0], 'browser-alice');
  checks.push('native bearer login and browser CORS');
  await page.screenshot({ path: `${output}/native-admin-denied.png` });
  checks.push('native non-admin cannot enter administrator UI');

  await page.goto(`${uiUrl}/settings`);
  await page.getByRole('heading', { name: 'Nexus Connection', exact: true }).waitFor();
  await page.getByText('browser-alice', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Change Password', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Delete My Account', exact: true }).count(), 0);
  assert.equal(await page.getByText(issued[0].key, { exact: true }).count(), 0);
  await page.screenshot({ path: `${output}/native-key-settings.png` });
  checks.push('native API key settings show the verified subject');

  await adminRequest(`/v2/auth/keys/${issued[0].key_hash}`, { method: 'DELETE' });
  const revokedResponsePromise = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/auth/whoami` && response.request().method() === 'GET');
  await page.reload();
  const revokedResponse = await revokedResponsePromise;
  assert.equal(revokedResponse.status(), 401);
  assert.equal(revokedResponse.headers()['access-control-allow-origin'], uiUrl);
  await page.waitForURL(`${uiUrl}/login`);
  assert.equal(await page.evaluate(() => localStorage.getItem('nexus_api_key')), null);
  checks.push('native warmed credential revocation clears browser identity');
  await page.screenshot({ path: `${output}/native-revoked-login.png` });

  await login(issued[1], 'browser-bob');
  checks.push('another native user remains valid after revocation');

  await login({ key: fixture.readerKey }, fixture.subject);
  await page.goto(`${uiUrl}/`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('search', { name: 'File search' });
  const runSearch = async (kind) => {
    const received = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/search/${kind}` && response.request().method() === 'POST');
    await search.getByRole('button', { name: 'Search', exact: true }).click();
    const response = await received;
    return { status: response.status(), body: await response.json() };
  };
  await search.getByRole('textbox', { name: 'Search files' }).fill('**/*.txt');
  const denied = await runSearch('glob');
  assert.equal(denied.status, 403, JSON.stringify(denied.body));
  await search.getByRole('alert').filter({ hasText: 'search path is not readable' }).waitFor();
  assert.equal(await search.getByText('No results found', { exact: true }).count(), 0);
  checks.push('native unreadable search root remains a visible permission error');

  const rootGrant = { ...fixture.grant, object_id: '/' };
  await adminRequest('/v2/rebac/tuples', { method: 'POST', body: JSON.stringify(rootGrant) });
  grants.push(rootGrant);
  const glob = await runSearch('glob');
  assert.equal(glob.status, 200, JSON.stringify(glob.body));
  assert.deepEqual(glob.body.paths, [fixture.visible]);
  await search.getByText(fixture.visible, { exact: true }).waitFor();
  assert.equal(await search.getByText(fixture.hidden, { exact: true }).count(), 0);
  checks.push('native glob keeps unreadable files out of browser results');

  await search.getByRole('button', { name: 'Content', exact: true }).click();
  await search.getByRole('textbox', { name: 'Search files' }).fill(fixture.needle);
  const grep = await runSearch('grep');
  assert.equal(grep.status, 200, JSON.stringify(grep.body));
  const matches = grep.body.matches;
  assert.deepEqual(matches.map((match) => match.path), [fixture.visible]);
  assert.equal(matches[0].line_number, 2);
  assert.equal(matches[0].line.includes(fixture.needle), true);
  await search.getByText('1 match', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/native-file-search.png` });
  checks.push('native grep renders real current file content and match counts');

  await adminRequest('/v2/rebac/tuples', { method: 'DELETE', body: JSON.stringify(fixture.grant) });
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await search.getByText('No results found', { exact: true }).waitFor();
  assert.equal(await search.getByText(fixture.visible, { exact: true }).count(), 0);
  await adminRequest('/v2/rebac/tuples', { method: 'POST', body: JSON.stringify(fixture.grant) });
  checks.push('native relation revocation removes warmed browser search results');

  await adminRequest('/v2/directories', { method: 'POST', body: JSON.stringify({ path: fileRoot, parents: true }) });
  createdFiles = true;
  const initialName = 'notes & 测试.txt';
  const finalName = 'renamed & 测试.txt';
  const initialPath = `${fileRoot}/${initialName}`;
  const finalPath = `${fileRoot}/${finalName}`;
  await adminRequest(`/v2/files?path=${encodeURIComponent(initialPath)}`, {
    method: 'PUT', body: '{"error":"actual file content"}', headers: { 'content-type': 'application/octet-stream' },
  });
  const rootListing = await (await adminRequest('/v2/directories?path=%2F')).json();
  assert.equal(rootListing.entries.some((entry) => entry.path === fileRoot && entry.is_directory), true,
    `created directory is missing from native root metadata: ${JSON.stringify(rootListing.entries)}`);
  const fileCalls = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === nativeUrl) fileCalls.push(url.pathname);
  });
  await page.goto(`${uiUrl}/login`);
  await page.getByLabel('Nexus Server URL').fill(nativeUrl);
  await page.getByLabel('API Key', { exact: true }).fill(admin);
  await page.getByRole('button', { name: 'Sign in with API Key' }).click();
  await page.waitForURL(`${uiUrl}/`);
  const rootName = fileRoot.slice(1);
  const folder = page.getByRole('checkbox', { name: `Select ${rootName}`, exact: true }).locator('..');
  await folder.click();
  await page.getByText(initialName, { exact: true }).first().click();
  await page.getByText('{"error":"actual file content"}', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByPlaceholder('Enter text content...').fill('edited ✓ & 中文');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('edited ✓ & 中文', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: `Select ${initialName}`, exact: true }).locator('..').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  await page.getByPlaceholder('Enter new name').fill(finalName);
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByRole('heading', { name: finalName, exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByPlaceholder('Enter text content...').fill('saved after rename ✓');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('saved after rename ✓', { exact: true }).waitFor();
  await page.getByText(`${Buffer.byteLength('saved after rename ✓')} bytes`, { exact: true }).waitFor();
  assert.equal(await (await adminRequest(`/v2/files?path=${encodeURIComponent(finalPath)}`)).text(), 'saved after rename ✓');
  const absent = await fetch(`${nativeUrl}/v2/files?path=${encodeURIComponent(initialPath)}`, { headers: { authorization: `Bearer ${admin}` } });
  assert.equal(absent.status, 404);
  assert.equal(fileCalls.some((path) => /^\/api\/nfs\/(list|read|write|rename|delete|exists|is_directory|mkdir|rmdir)$/.test(path)), false);
  checks.push('native file browsing, JSON-looking bytes, UTF-8 edits and saving after rename');
  await page.screenshot({ path: `${output}/native-file-editor.png` });

  const bytes = Buffer.from(Array.from({ length: 65536 }, (_, index) => index % 256));
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Upload Files', exact: true }).click();
  await page.locator('input[type=file]').first().setInputFiles({ name: 'bytes & 测试.bin', mimeType: 'application/octet-stream', buffer: bytes });
  await page.getByRole('button', { name: 'Upload (1 file)', exact: true }).click();
  await page.getByText('bytes & 测试.bin', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Close', exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Select bytes & 测试.bin', exact: true }).locator('..').click({ button: 'right' });
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download', exact: true }).click();
  const stream = await (await downloaded).createReadStream();
  assert.ok(stream, 'native browser download must provide a readable stream');
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), bytes);
  checks.push('native browser binary upload and download preserve every byte');

  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'New Folder', exact: true }).click();
  await page.getByPlaceholder('folder name').fill('created & 测试');
  await page.getByPlaceholder('folder name').press('Enter');
  await page.getByRole('checkbox', { name: 'Select created & 测试', exact: true }).waitFor();
  page.on('dialog', (dialog) => dialog.accept());
  await folder.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await folder.waitFor({ state: 'detached' });
  assert.equal(await page.getByRole('button', { name: rootName, exact: true }).count(), 0);
  assert.equal(await page.getByRole('heading', { name: finalName, exact: true }).count(), 0);
  checks.push('native browser directory creation and recursive deletion clear selected descendants');
} catch (error) {
  failure = error;
  if (page) await page.screenshot({ path: `${output}/native-browser-failure.png`, mask: [page.getByLabel('API Key', { exact: true })] }).catch(() => {});
} finally {
  const cleanup = await Promise.allSettled([
    browser?.close(),
    (async () => {
      if (preview) {
        preview.httpServer.closeAllConnections();
        await new Promise((resolve, reject) => preview.httpServer.close((error) => (error ? reject(error) : resolve())));
      }
    })(),
  ]);
  for (const result of cleanup) {
    if (result.status === 'rejected') failure ??= result.reason;
  }
  if (createdFiles) {
    try {
      await adminRequest(`/v2/files?path=${encodeURIComponent(fileRoot)}&recursive=true`, { method: 'DELETE' });
    } catch (error) {
      failure ??= error;
    }
  }
  for (const grant of grants) {
    try {
      await adminRequest('/v2/rebac/tuples', { method: 'DELETE', body: JSON.stringify(grant) });
    } catch (error) {
      failure ??= error;
    }
  }
  for (const credential of issued) {
    try {
      await adminRequest(`/v2/auth/keys/${credential.key_hash}`, { method: 'DELETE' });
    } catch (error) {
      failure ??= error;
    }
  }
}
const redact = (message) => secrets.reduce((text, secret) => text.replaceAll(secret, '[credential]'), message);
const result = { success: !failure, checks, error: failure ? redact(failure.message) : undefined };
await writeFile(`${output}/native-browser-result.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
process.exitCode = failure ? 1 : 0;
