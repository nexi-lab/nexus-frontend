import { expect, test } from '@playwright/test';
import { accountPassword, createAccount, passwordLogin } from './accounts';
import { backend, prepareBrowser } from './backend';

test.beforeEach(async ({ request, context }) => {
  await prepareBrowser(request, context);
});

test('password login and profile refresh use Rust accounts without granting file access', async ({ page, request }) => {
  const email = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(page).toHaveURL('/login');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path.startsWith('/v2/'))).toBe(false);
  expect(calls.find((call: { path: string }) => call.path === '/auth/login').authorized).toBe(false);
  expect(calls.filter((call: { path: string }) => call.path === '/auth/me')).toEqual([
    expect.objectContaining({ method: 'GET', authorized: true, principal: null }),
  ]);
  expect(await page.evaluate(() => localStorage.getItem('nexus_user_account'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_jwt_token'))).toBeNull();
  const facts = await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json();
  expect(facts.users).toEqual([{ email_verified: 1, zone_id: null, api_key: null, is_global_admin: 0 }]);
});

test('an unverified account cannot establish a password session', async ({ page, request }) => {
  const email = await createAccount(request, false);
  await passwordLogin(page, email);
  await expect(page.getByRole('alert')).toHaveText('Email is not verified');
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
});

test('a wrong password preserves the existing native connection', async ({ page, request }) => {
  const email = await createAccount(request);
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await passwordLogin(page, email, 'incorrect-account-password');
  await expect(page.getByRole('alert')).toHaveText('Invalid email/username or password');
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.find((call: { path: string }) => call.path === '/auth/login').authorized).toBe(false);
});

test('profile edits survive refresh and do not create native grants', async ({ page, request }) => {
  const email = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  await page.getByLabel('Display name', { exact: true }).fill('Account display 测试');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Profile updated.');
  await page.reload();
  await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('Account display 测试');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(
    calls.some(
      (call: { path: string; method: string; authorized: boolean; principal: string | null }) =>
        call.path === '/auth/me' && call.method === 'PATCH' && call.authorized && call.principal === null,
    ),
  ).toBe(true);
  const facts = await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json();
  expect(facts.users).toEqual([{ email_verified: 1, zone_id: null, api_key: null, is_global_admin: 0 }]);
});

test('password changes verify the current password and account logout preserves native access', async ({ page, request }) => {
  const email = await createAccount(request);
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  const session = await page.evaluate(() => sessionStorage.getItem('nexus_account_session'));
  const replacement = 'replacement-account-password-2026';
  await page.getByLabel('Current Password', { exact: true }).fill('incorrect-current-password');
  await page.getByLabel('New Password', { exact: true }).fill(replacement);
  await page.getByLabel('Confirm New Password', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Invalid email/username or password');
  await expect(page).toHaveURL('/account');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBe(session);
  await page.getByLabel('Current Password', { exact: true }).fill(accountPassword);
  await page.getByRole('button', { name: 'Change Password', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Password changed successfully!');
  await expect(page.getByLabel('Current Password', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('New Password', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Sign out of account', exact: true }).click();
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  await passwordLogin(page, email);
  await expect(page.getByRole('alert')).toHaveText('Invalid email/username or password');
  await passwordLogin(page, email, replacement);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Files', exact: true }).click();
  await expect(page).toHaveURL('/files');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path.startsWith('/v2/')).every((call: { principal: string }) => call.principal === 'server-alice')).toBe(
    true,
  );
});

test('a rejected account token clears only the account session', async ({ page, request }) => {
  await page.addInitScript((server) => {
    if (sessionStorage.getItem('fixture-seeded')) return;
    sessionStorage.setItem('fixture-seeded', 'true');
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
    sessionStorage.setItem('nexus_account_session', JSON.stringify({ serverUrl: server, token: 'rejected-account-token', user: { is_global_admin: true } }));
  }, backend);
  await page.goto('/account');
  await expect(page).toHaveURL('/login');
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.find((call: { path: string }) => call.path === '/auth/me').principal).toBeNull();
});

test('a revoked native credential does not clear a valid Rust account session', async ({ page, request }) => {
  const email = await createAccount(request);
  await passwordLogin(page, email);
  await expect(page).toHaveURL('/account');
  await page.evaluate((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-revoked');
  }, backend);
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('nexus_account_session'))).not.toBeNull();
});
