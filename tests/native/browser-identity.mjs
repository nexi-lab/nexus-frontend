import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';
import { preview as startPreview } from 'vite';

const { values } = parseArgs({
  options: {
    'http-url': { type: 'string' },
    'admin-key-file': { type: 'string' },
    'output-dir': { type: 'string' },
    'ui-port': { type: 'string', default: '4173' },
  },
});
for (const key of ['http-url', 'admin-key-file', 'output-dir']) {
  if (!values[key]) throw new Error(`--${key} is required`);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const uiUrl = `http://127.0.0.1:${values['ui-port']}`;
const nativeUrl = values['http-url'].replace(/\/$/, '');
const output = values['output-dir'];
const admin = (await readFile(values['admin-key-file'], 'utf8')).trim();
const secrets = [admin];
const issued = [];
const checks = [];
let browser;
let preview;
let failure;

async function adminRequest(path, options = {}) {
  const response = await fetch(`${nativeUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${admin}` },
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.ok, true, `native administrator request failed: ${response.status}`);
  return response;
}

try {
  await mkdir(output, { recursive: true });
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
  const page = await browser.newPage();
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
} catch (error) {
  failure = error;
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
