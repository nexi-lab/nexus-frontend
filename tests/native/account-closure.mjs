import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { verificationLinkFromMessage } from '../fixtures/accounts.mjs';

export async function verifyAccountClosure({ page, accounts, uiUrl, nativeUrl, nativeKey, visiblePath, needle, secrets }) {
  const email = `native-account-${randomUUID()}@example.test`;
  const password = 'native-account-acceptance-password';
  secrets.push(password);
  await page.goto(`${uiUrl}/register`);
  await page.getByLabel('Nexus Server URL').fill(uiUrl);
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Verification request accepted.' }).waitFor();
  await expect.poll(() => accounts.mail.some((message) => message.includes(email))).toBe(true);
  const link = verificationLinkFromMessage(accounts.mail.find((message) => message.includes(email)));
  secrets.push(new URL(link).searchParams.get('token'));
  await page.goto(link);
  await page.getByLabel('Nexus Server URL').fill(uiUrl);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await page.getByText('Email verified successfully.', { exact: true }).waitFor();
  await page.goto(`${uiUrl}/login`);
  await page.getByLabel('Nexus Server URL').fill(uiUrl);
  await page.getByLabel('Email or username', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
  await page.waitForURL(`${uiUrl}/account`);
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('nexus_account_session')));
  assert.equal(typeof session.token, 'string');
  secrets.push(session.token);
  assert.equal(await page.evaluate(() => localStorage.getItem('nexus_api_key')), nativeKey);
  assert.equal(await page.evaluate(() => localStorage.getItem('nexus_api_url')), nativeUrl);
  await page.getByLabel(`Type ${email} to confirm`, { exact: true }).fill(email);
  const deletion = page.waitForResponse((response) => response.url() === `${uiUrl}/auth/me` && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Delete account permanently', exact: true }).click();
  const response = await deletion;
  assert.equal(response.status(), 200);
  assert.equal(response.request().headers().authorization, `Bearer ${session.token}`);
  assert.equal(response.request().postData(), null);
  await page.waitForURL(`${uiUrl}/login`);
  assert.deepEqual(accounts.facts(email), []);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('nexus_account_session')), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('nexus_api_key')), nativeKey);
  assert.equal(await page.evaluate(() => localStorage.getItem('nexus_api_url')), nativeUrl);
  const file = await page.evaluate(
    async ({ nativeUrl, visiblePath }) => {
      const response = await fetch(`${nativeUrl}/v2/files?path=${encodeURIComponent(visiblePath)}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('nexus_api_key')}` },
      });
      return { status: response.status, text: await response.text() };
    },
    { nativeUrl, visiblePath },
  );
  assert.equal(file.status, 200);
  assert(file.text.includes(needle));
  await page.goto(`${uiUrl}/files`);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const search = page.getByRole('search', { name: 'File search' });
  await search.getByRole('button', { name: 'Content', exact: true }).click();
  await search.getByRole('textbox', { name: 'Search files' }).fill(needle);
  const searched = page.waitForResponse((response) => response.url() === `${nativeUrl}/v2/search/grep` && response.request().method() === 'POST');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  const result = await searched;
  assert.equal(result.status(), 200);
  assert.equal(result.request().headers().authorization, `Bearer ${nativeKey}`);
  assert.deepEqual(
    (await result.json()).matches.map((match) => match.path),
    [visiblePath],
  );
  await search.getByText('1 match', { exact: true }).waitFor();
  return [
    'actual Rust account and sign-in bindings deleted while native file access remains valid',
    'actual native browser Search retains its independent credential after account deletion',
  ];
}
