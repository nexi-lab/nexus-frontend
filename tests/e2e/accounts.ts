import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, type Page } from '@playwright/test';
import { verificationLinkFromMessage } from '../fixtures/verification-email.mjs';
import { backend } from './backend';

export const accountPassword = 'browser-account-password-2026';

export async function verificationLink(request: APIRequestContext, email: string): Promise<string> {
  await expect
    .poll(async () => {
      const { messages, rust } = await (await request.get(`${backend}/__fixture/mail`)).json();
      expect(rust, 'Actual Rust account binary and canonical schema are required').toBe(true);
      return messages.some((message: string) => message.includes(email));
    })
    .toBe(true);
  const { messages } = await (await request.get(`${backend}/__fixture/mail`)).json();
  return verificationLinkFromMessage(messages.find((message: string) => message.includes(email)));
}

export async function createAccount(request: APIRequestContext, verified = true) {
  const email = `account-${randomUUID()}@example.test`;
  const response = await request.post(`${backend}/auth/register`, { data: { email, password: accountPassword } });
  expect(response.status()).toBe(201);
  if (verified) {
    expect((await request.post(`${backend}/auth/request-verification`, { data: { email } })).status()).toBe(202);
    const token = new URL(await verificationLink(request, email)).searchParams.get('token');
    expect((await request.post(`${backend}/auth/verify-email`, { data: { token } })).status()).toBe(200);
  }
  return email;
}

export async function passwordLogin(page: Page, identifier: string, password = accountPassword) {
  await page.goto('/login');
  await page.getByLabel('Nexus Server URL').fill(backend);
  await page.getByLabel('Email or username', { exact: true }).fill(identifier);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in with password', exact: true }).click();
}
