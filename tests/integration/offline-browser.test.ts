import { it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  runPopulation,
  starterConfig,
  presets,
  type Config,
  type FixtureResponse,
} from '../../packages/core/src/index.js';
let output: string;
const target = 'http://127.0.0.1:4173';
const html = (
  fixed: boolean,
) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>
  <h1>Registration fixture</h1><form><label>Email<input id="email" type="email" required></label><label>Password<input id="password" type="password" required></label><button>Create account</button></form><p id="result"></p><p id="fresh"></p>
  <script>document.querySelector('#fresh').textContent=localStorage.getItem('visited')?'Returning':'Fresh';localStorage.setItem('visited','yes');document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('#result').textContent='${fixed ? 'Account created' : 'Processing'}'};</script></body></html>`;
beforeAll(async () => {
  output = await mkdtemp(join(process.cwd(), 'artifacts', 'offline-browser-'));
});
afterAll(async () => {
  await rm(output, { recursive: true, force: true });
});
function config(): Config {
  const c = starterConfig(target);
  c.personas = [{ ...presets[0]!, actionTimeoutMs: 2000 }];
  c.scenarios[0]!.steps = [
    { type: 'fill', selector: '#email', value: 'synthetic@example.test' },
    { type: 'fill', selector: '#password', value: 'Synthetic-only-123' },
    { type: 'click', selector: 'button' },
    { type: 'assertText', selector: '#result', text: 'Account created' },
    { type: 'assertText', selector: '#fresh', text: 'Fresh' },
  ];
  return c;
}
it('runs genuine Chromium interactions against explicitly labelled offline responses; captures failure evidence then verifies the repair', async () => {
  const c = config();
  c.capture.traces = true;
  const broken = await runPopulation(c, {
    outputDir: output,
    mockResponses: { [target + '/']: { body: html(false) } },
  });
  expect(broken.transport).toBe('fixtures');
  expect(broken.status).toBe('failed');
  expect(broken.sessions[0]?.issues[0]?.category).toBe('Verified Defect');
  const s = broken.sessions[0]!;
  expect(
    (await readFile(join(output, broken.runId, s.screenshot!))).subarray(1, 4).toString(),
  ).toBe('PNG');
  expect((await readFile(join(output, broken.runId, s.trace!))).subarray(0, 2).toString()).toBe(
    'PK',
  );
  const fixed = await runPopulation(c, {
    outputDir: output,
    mockResponses: { [target + '/']: { body: html(true) } },
  });
  expect(fixed.status).toBe('passed');
  expect(fixed.sessions[0]?.timeline).toHaveLength(5);
});
it('isolates local storage across concurrent mobile, keyboard and desktop sessions', async () => {
  const c = config();
  c.personas = [presets[0]!, presets[4]!, presets[5]!];
  c.concurrency = 2;
  const report = await runPopulation(c, {
    outputDir: output,
    mockResponses: { [target + '/']: { body: html(true) } },
  });
  expect(report.summary.passed).toBe(3);
  expect(report.summary.errors).toBe(0);
});
it('cancels browser work and recovers for a subsequent run', async () => {
  const c = config();
  c.scenarios[0]!.steps = [{ type: 'assertVisible', selector: '#never' }];
  const controller = new AbortController();
  const report = await runPopulation(c, {
    outputDir: output,
    mockResponses: { [target + '/']: { body: html(true) } },
    signal: controller.signal,
    onEvent: (e) => {
      if (e.type === 'session.started') setTimeout(() => controller.abort(), 300);
    },
  });
  expect(report.status).toBe('cancelled');
  expect(
    (
      await runPopulation(config(), {
        outputDir: output,
        mockResponses: { [target + '/']: { body: html(true) } },
      })
    ).status,
  ).toBe('passed');
});
it('blocks redirects even when supplied by a response fixture', async () => {
  const report = await runPopulation(config(), {
    outputDir: output,
    mockResponses: {
      [target + '/']: { body: '', status: 302, headers: { location: 'http://example.com' } },
    },
  });
  expect(report.status).not.toBe('passed');
  expect(report.sessions[0]?.issues.some((i) => i.title.includes('redirect'))).toBe(true);
});
it('enforces session deadlines and reports mobile overflow separately', async () => {
  const c = config();
  c.personas = [presets[0]!];
  c.scenarios[0]!.maxDurationMs = 500;
  c.scenarios[0]!.steps = [{ type: 'assertVisible', selector: '#never' }];
  const report = await runPopulation(c, {
    outputDir: output,
    mockResponses: { [target + '/']: { body: html(true) } },
  });
  expect(report.status).toBe('failed');
  expect(report.sessions[0]?.issues.some((i) => i.title.includes('budget'))).toBe(true);
  const mobile = starterConfig(target);
  mobile.personas = [presets[4]!];
  const overflow = await runPopulation(mobile, {
    outputDir: output,
    mockResponses: {
      [target + '/']: {
        body: '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div style="width:1000px">Overflow</div></body></html>',
      },
    },
  });
  expect(overflow.sessions[0]?.issues.some((i) => i.category === 'Potential UX Concern')).toBe(
    true,
  );
});
