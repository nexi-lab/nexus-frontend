import type { APIRequestContext, BrowserContext } from '@playwright/test';

export const backend = 'http://127.0.0.1:4181';

export async function prepareBrowser(request: APIRequestContext, context: BrowserContext) {
  const response = await request.post(`${backend}/__fixture/reset`);
  if (!response.ok()) throw new Error(`Fixture reset failed: ${response.status()}`);
  await context.route('**/*', async (route) => {
    const origin = new URL(route.request().url()).origin;
    if (origin === 'http://127.0.0.1:4173' || origin === backend) await route.continue();
    else await route.abort('blockedbyclient');
  });
}
