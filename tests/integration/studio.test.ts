import { it, expect } from 'vitest';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { starterConfig } from '../../packages/shared/src/index.js';
it('renders the built React Studio and supports persona duplication, definition editing and save messages', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const config = starterConfig();
    await page.addInitScript((c) => {
      const w = window as any;
      w.__sent = [];
      w.acquireVsCodeApi = () => ({
        postMessage: (message: any) => {
          w.__sent.push(message);
          if (message.type === 'ready')
            setTimeout(() => window.postMessage({ type: 'state', config: c }, '*'), 0);
        },
      });
    }, config);
    await page.route('http://127.0.0.1:4173/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      const name = path === '/' ? 'index.html' : path.slice(1);
      if (!['index.html', 'studio.js', 'studio.css'].includes(name)) {
        await route.abort();
        return;
      }
      await route.fulfill({
        body: await readFile(join('apps/vscode-extension/media/studio', name)),
        contentType: name.endsWith('.js')
          ? 'text/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : 'text/html',
      });
    });
    await page.goto('http://127.0.0.1:4173/');
    await page.getByRole('heading', { name: 'GhostTown Studio' }).waitFor();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await page.getByRole('button', { name: 'Population · 2', exact: true }).waitFor();
    const item = { ...config.personas[0], id: 'edited', name: 'Edited profile' };
    await page.getByLabel('Validated JSON definition').fill(JSON.stringify(item));
    await page.getByRole('button', { name: 'Apply definition', exact: true }).click();
    await page.getByRole('button', { name: 'Save project *', exact: true }).click();
    const messages = await page.evaluate(() => (window as any).__sent);
    const save = messages.find((m: any) => m.type === 'save');
    expect(save.config.personas).toHaveLength(2);
    expect(save.config.personas[1].name).toBe('Edited profile');
  } finally {
    await browser.close();
  }
});
