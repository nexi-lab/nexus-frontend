import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyManagement({ page, uiUrl, nativeUrl, adminRequest, filePath, folderName, secrets, issued, grants }) {
  const subject = `browser-management-${randomUUID()}`;
  const label = `Browser management ${subject}`;
  const tuple = { zone: 'sharedzone', object_type: 'file', object_id: filePath, relation: 'reader', subject_type: 'user', subject_id: subject };
  await page.goto(`${uiUrl}/admin`);
  await page.getByRole('heading', { name: 'Native credentials', exact: true }).waitFor();
  await page.getByLabel('Name', { exact: true }).fill(label);
  await page.getByLabel('Subject ID', { exact: true }).fill(subject);
  await page.getByLabel('Zone grants', { exact: false }).fill('sharedzone:r');
  const minted = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/auth/keys` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create credential', exact: true }).click();
  const response = await minted;
  assert.equal(response.status(), 200);
  const credential = await response.json();
  assert.equal(typeof credential.key, 'string');
  secrets.push(credential.key);
  issued.push(credential);
  const input = page.getByLabel('New native credential', { exact: true });
  await input.waitFor();
  assert.equal(await input.getAttribute('type'), 'password');
  assert.equal(await input.inputValue(), credential.key);
  assert.equal(await page.evaluate((key) => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(key), credential.key), false);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const read = () =>
    fetch(`${nativeUrl}/v2/files?path=${encodeURIComponent(filePath)}`, {
      headers: { authorization: `Bearer ${credential.key}` },
      signal: AbortSignal.timeout(15000),
    });
  assert.equal((await read()).status, 403);
  await page.goto(`${uiUrl}/files`);
  await page
    .getByRole('checkbox', { name: `Select ${folderName}`, exact: true })
    .locator('..')
    .click();
  await page
    .getByRole('checkbox', { name: `Select ${filePath.split('/').at(-1)}`, exact: true })
    .locator('..')
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage Permissions', exact: true }).click();
  await page.getByLabel('Zone', { exact: true }).fill('sharedzone');
  await page.getByLabel('Subject ID', { exact: true }).fill(subject);
  await page.getByLabel('Relation', { exact: true }).fill('reader');
  const granted = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/rebac/tuples` && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Grant relationship', exact: true }).click();
  assert.equal((await granted).status(), 200);
  grants.push(tuple);
  const revoke = page.getByRole('button', { name: `Revoke user:${subject} reader`, exact: true });
  await revoke.waitFor();
  const allowed = await read();
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), 'saved after rename ✓');
  const listed = await (await adminRequest('/v2/rebac/tuples?zone=sharedzone')).json();
  assert(listed.tuples.some((item) => Object.entries(tuple).every(([key, value]) => item[key] === value)));
  const revoked = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/rebac/tuples` && response.request().method() === 'DELETE');
  await revoke.click();
  assert.equal((await revoked).status(), 200);
  await revoke.waitFor({ state: 'detached' });
  assert.equal((await read()).status, 403);
  await page.goto(`${uiUrl}/admin`);
  page.once('dialog', (dialog) => dialog.accept());
  const removed = page.waitForResponse(
    (response) => response.url() === `${nativeUrl}/v2/auth/keys/${credential.key_hash}` && response.request().method() === 'DELETE',
  );
  await page.getByRole('button', { name: `Revoke ${label}`, exact: true }).click();
  assert.equal((await removed).status(), 200);
  await page.getByRole('heading', { name: label, exact: true }).waitFor({ state: 'detached' });
  const whoami = await fetch(`${nativeUrl}/v2/auth/whoami`, { headers: { authorization: `Bearer ${credential.key}` }, signal: AbortSignal.timeout(15000) });
  assert.equal(whoami.status, 401);
  return ['native UI credential mint/list/revoke and in-memory plaintext', 'native UI full tuple grant/revoke changes warmed file authorization'];
}
