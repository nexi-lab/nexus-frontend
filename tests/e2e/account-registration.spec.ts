import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { verificationLink } from './accounts';
import { backend, prepareBrowser } from './backend';

const password = 'browser-registration-password-2026';

test.beforeEach(async ({ request, context }) => {
  await prepareBrowser(request, context);
  const state = await (await request.get(`${backend}/__fixture/mail`)).json();
  expect(state.rust, 'Run account acceptance with the actual nexusd-accounts binary and its canonical schema').toBe(true);
});

test('registration verifies a real Rust account through SMTP without creating browser credentials', async ({ page, request }) => {
  const email = `browser-${randomUUID()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Verification request accepted. Check your inbox.');
  const facts = async () => (await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json()).users;
  expect(await facts()).toEqual([{ email_verified: 0, zone_id: null, api_key: null, is_global_admin: 0 }]);
  const link = await verificationLink(request, email);
  await page.goto(link);
  await expect(page).toHaveURL('/verify-email');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Email verified successfully.');
  expect(await facts()).toEqual([{ email_verified: 1, zone_id: null, api_key: null, is_global_admin: 0 }]);
  const storage = await page.evaluate(() => ({
    jwt: localStorage.getItem('nexus_jwt_token'),
    native: localStorage.getItem('nexus_api_key'),
    user: localStorage.getItem('nexus_user_account'),
    session: { ...sessionStorage },
  }));
  expect(storage).toEqual({ jwt: null, native: null, user: null, session: {} });
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path === '/auth/register')).toHaveLength(1);
  expect(calls.filter((call: { path: string }) => call.path === '/auth/verify-email')).toHaveLength(1);
  expect(calls.filter((call: { path: string }) => call.path.startsWith('/auth/')).every((call: { authorized: boolean }) => !call.authorized)).toBe(true);
  expect(calls.some((call: { path: string }) => call.path.startsWith('/v2/'))).toBe(false);
});

test('failed mail requests can be resent without registering the account again', async ({ page, request }) => {
  const email = `resend-${randomUUID()}@example.test`;
  await page.route(`${backend}/auth/request-verification`, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Delivery is unavailable' }),
    }),
  );
  await page.goto('/register');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Verify your email', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Delivery is unavailable');
  await page.unroute(`${backend}/auth/request-verification`);
  await page.getByRole('button', { name: 'Resend verification email', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Verification request accepted. Check your inbox.');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path === '/auth/register')).toHaveLength(1);
  const facts = await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json();
  expect(facts.users).toHaveLength(1);
  expect(facts.users[0].email_verified).toBe(0);
});

test('a rejected verification token stays an error and is removed from the address bar', async ({ page, request }) => {
  await page.goto('/verify-email?token=not-a-valid-account-token&server=https://untrusted.example');
  await expect(page).toHaveURL('/verify-email');
  await expect(page.getByLabel('Nexus Server URL')).toHaveValue('');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Email verified successfully.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('nexus_jwt_token'))).toBeNull();
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.filter((call: { path: string }) => call.path === '/auth/verify-email')).toHaveLength(1);
});

test('opening verification without a token cannot submit an account request', async ({ page, request }) => {
  await page.goto('/verify-email');
  await expect(page.getByRole('alert')).toHaveText('Open the verification link from your email.');
  await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toHaveCount(0);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path.startsWith('/auth/'))).toBe(false);
});

test('duplicate registration keeps the original account and displays the Rust error', async ({ page, request }) => {
  const email = `duplicate-${randomUUID()}@example.test`;
  const original = await request.post(`${backend}/auth/register`, { data: { email, password } });
  expect(original.status()).toBe(201);
  await page.goto('/register');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('Email', { exact: false }).fill(email);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('already registered');
  await expect(page.getByRole('heading', { name: 'Create your account', exact: true })).toBeVisible();
  const facts = await (await request.get(`${backend}/__fixture/account-facts`, { params: { email } })).json();
  expect(facts.users).toEqual([{ email_verified: 0, zone_id: null, api_key: null, is_global_admin: 0 }]);
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  expect(calls.some((call: { path: string }) => call.path === '/auth/request-verification')).toBe(false);
});

test('registration does not forward or replace an existing native credential', async ({ page, request }) => {
  await page.addInitScript((server) => {
    localStorage.setItem('nexus_api_url', server);
    localStorage.setItem('nexus_api_key', 'sk-fixture-server-alice');
  }, backend);
  await page.goto('/register');
  await page.getByLabel('Email', { exact: false }).fill(`separate-${randomUUID()}@example.test`);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Verification request accepted. Check your inbox.');
  const { calls } = await (await request.get(`${backend}/__fixture/state`)).json();
  const accountCalls = calls.filter((call: { path: string }) => call.path.startsWith('/auth/'));
  expect(accountCalls).toHaveLength(2);
  expect(accountCalls.every((call: { authorized: boolean }) => !call.authorized)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
  expect(await page.evaluate(() => localStorage.getItem('nexus_jwt_token'))).toBeNull();
});
