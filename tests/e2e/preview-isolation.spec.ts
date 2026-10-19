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

async function write(request: APIRequestContext, name: string, bytes: Buffer) {
  const response = await request.put(`${backend}/v2/files?path=${encodeURIComponent(`/docs/${name}`)}`, {
    data: bytes,
    headers: { Authorization: 'Bearer sk-fixture-server-alice', 'Content-Type': 'application/octet-stream' },
  });
  expect(response.ok()).toBe(true);
}

async function open(page: Page, name: string) {
  await page.goto('/');
  await page.getByText('docs', { exact: true }).first().click();
  await page.getByText(name, { exact: true }).first().click();
}

test('HTML scripts cannot read the parent origin in normal or fullscreen preview', async ({ page, request }) => {
  await write(
    request,
    'isolated.html',
    Buffer.from(`<main id="result">pending</main><script>
    try { void parent.localStorage.length; document.querySelector('#result').textContent = 'parent-accessible'; }
    catch { document.querySelector('#result').textContent = 'parent-blocked'; }
  </script>`),
  );
  await open(page, 'isolated.html');
  const frame = page.frameLocator('iframe[title="isolated.html"]');
  await expect(frame.locator('#result')).toHaveText('parent-blocked');
  await expect(page.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect(page.locator('iframe')).toHaveAttribute('referrerpolicy', 'no-referrer');
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('parent-blocked');
  await page.getByRole('button', { name: 'Exit Fullscreen', exact: true }).click();
  await expect(frame.locator('#result')).toHaveText('parent-blocked');
  expect(await page.evaluate(() => localStorage.getItem('nexus_api_key'))).toBe('sk-fixture-server-alice');
});

for (const name of ['original.docx', 'original.xlsx']) {
  test(`${name} downloads original native bytes without external conversion`, async ({ page, request }) => {
    const bytes = Buffer.from([0x50, 0x4b, 3, 4, 0, 255, 127, 128]);
    await write(request, name, bytes);
    const external: string[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.protocol.startsWith('http') && !['http://127.0.0.1:4173', backend].includes(url.origin)) external.push(url.origin);
    });
    await open(page, name);
    await expect(page.getByText('Preview unavailable for this file type.', { exact: true })).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).first().click();
    const stream = await (await downloaded).createReadStream();
    if (!stream) throw new Error('Download has no stream');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(bytes);
    expect(external).toEqual([]);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
}

function pdf() {
  const drawing = '0 0 1 rg 10 10 50 50 re f\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(drawing)} >>\nstream\n${drawing}endstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, value] of objects.entries()) {
    offsets.push(Buffer.byteLength(result));
    result += `${index + 1} 0 obj\n${value}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}

test('valid PDF renders pixels and zooms using a bundled same-origin worker', async ({ page, request }) => {
  await write(request, 'local.pdf', pdf());
  const worker = page.waitForEvent('worker');
  await open(page, 'local.pdf');
  const pdfWorker = await worker;
  expect(new URL(pdfWorker.url()).origin).toBe('http://127.0.0.1:4173');
  expect(new URL(pdfWorker.url()).pathname).toMatch(/pdf\.worker.*\.mjs$/);
  await expect(page.getByText('Page 1 of 1', { exact: true })).toBeVisible();
  const canvas = page.getByLabel('PDF page', { exact: true });
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const canvas = element as {
          height: number;
          getContext(type: string): { getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray } } | null;
        };
        const pixel = canvas.getContext('2d')?.getImageData(30, canvas.height - 30, 1, 1).data;
        return pixel ? [...pixel] : [];
      }),
    )
    .toEqual([0, 0, 255, 255]);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(page.getByText('175%', { exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute('width', '175');
  await expect(page.getByRole('button', { name: 'Next page', exact: true })).toBeDisabled();
});
