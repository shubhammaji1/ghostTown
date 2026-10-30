import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runPopulation,
  starterConfig,
  presets,
  reportSchema,
  type Config,
  type RunEvent,
} from '../../packages/core/src/index.js';
// @ts-expect-error Controlled JavaScript fixture has no declaration file.
import { createPlayground } from '../../fixtures/demo-app/server.mjs';
let server: Server, target: string, output: string;
beforeAll(async () => {
  server = createPlayground();
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  target = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  output = await mkdtemp(join(process.cwd(), 'artifacts', 'ghosttown-integration-'));
});
afterAll(async () => {
  await new Promise<void>((res) => server.close(() => res()));
  await rm(output, { recursive: true, force: true });
});
function config(startPath = '/'): Config {
  const c = starterConfig(target);
  c.personas = [presets[0]!];
  c.scenarios[0]!.startPath = startPath;
  return c;
}
describe('real Chromium acceptance', () => {
  it('records genuine pass, report and ordered progress events', async () => {
    const events: RunEvent[] = [];
    const report = await runPopulation(config(), {
      outputDir: output,
      onEvent: (e) => events.push(e),
    });
    expect(report.status).toBe('passed');
    expect(report.summary.passed).toBe(1);
    expect(events.map((e) => e.sequence)).toEqual(events.map((_, i) => i));
    expect(events.at(-1)?.type).toBe('run.completed');
    const persisted = reportSchema.parse(
      JSON.parse(await readFile(join(output, report.runId, 'report.json'), 'utf8')),
    );
    expect(persisted).toEqual(report);
  });
  it('finds the seeded registration defect with a real screenshot and trace, then passes after repair', async () => {
    const c = config('/register');
    c.capture.traces = true;
    c.personas[0] = { ...presets[0]!, actionTimeoutMs: 700 };
    c.scenarios[0]!.steps = [
      { type: 'fill', selector: '#email', value: 'synthetic@example.test' },
      { type: 'fill', selector: '#password', value: 'Synthetic-only-123' },
      { type: 'click', selector: 'button[type=submit]' },
      { type: 'assertText', selector: '#result', text: 'Account created' },
    ];
    const broken = await runPopulation(c, { outputDir: output });
    expect(broken.status).toBe('failed');
    expect(broken.sessions[0]?.issues[0]?.category).toBe('Verified Defect');
    const session = broken.sessions[0]!;
    const screenshot = await readFile(join(output, broken.runId, session.screenshot!));
    expect(screenshot.subarray(1, 4).toString()).toBe('PNG');
    const trace = await readFile(join(output, broken.runId, session.trace!));
    expect(trace.subarray(0, 2).toString()).toBe('PK');
    c.scenarios[0]!.startPath = '/register?fixed=1';
    const fixed = await runPopulation(c, { outputDir: output });
    expect(fixed.status).toBe('passed');
  });
  it('isolates users and runs mobile and keyboard sessions', async () => {
    const c = config('/register?fixed=1');
    c.personas = [presets[0]!, presets[4]!, presets[5]!];
    c.concurrency = 2;
    c.scenarios[0]!.steps = [
      { type: 'fill', selector: '#email', value: 'synthetic@example.test' },
      { type: 'fill', selector: '#password', value: 'Synthetic-only-123' },
      { type: 'click', selector: 'button[type=submit]' },
      { type: 'assertText', selector: '#result', text: 'Account created' },
    ];
    const report = await runPopulation(c, { outputDir: output });
    expect(report.sessions.map((s) => [s.persona, s.status])).toEqual(
      expect.arrayContaining([
        ['keyboard', 'passed'],
        ['mobile', 'passed'],
        ['first-time', 'passed'],
      ]),
    );
  });
  it('blocks an external redirect before making the external request', async () => {
    const c = config('/redirect');
    const report = await runPopulation(c, { outputDir: output });
    expect(report.status).not.toBe('passed');
    expect(report.sessions[0]?.issues.some((i) => i.title.includes('redirect'))).toBe(true);
  });
  it('identifies mobile overflow as a concern rather than an assertion defect', async () => {
    const c = config('/overflow');
    c.personas = [presets[4]!];
    const report = await runPopulation(c, { outputDir: output });
    expect(report.sessions[0]?.issues.some((i) => i.category === 'Potential UX Concern')).toBe(
      true,
    );
  });
  it('cancels an in-flight locator wait, closes the browser, and supports another run', async () => {
    const c = config();
    c.scenarios[0]!.steps = [{ type: 'assertVisible', selector: '#never-present' }];
    const abort = new AbortController();
    let cancelled = false;
    const result = await runPopulation(c, {
      outputDir: output,
      signal: abort.signal,
      onEvent: (e) => {
        if (e.type === 'session.started') {
          setTimeout(() => abort.abort(), 300);
          cancelled = true;
        }
      },
    });
    expect(cancelled).toBe(true);
    expect(result.status).toBe('cancelled');
    expect((await runPopulation(config(), { outputDir: output })).status).toBe('passed');
  });
  it('enforces scenario duration independently of the action timeout', async () => {
    const c = config();
    c.scenarios[0]!.maxDurationMs = 500;
    c.scenarios[0]!.steps = [{ type: 'assertVisible', selector: '#never' }];
    const start = Date.now();
    const report = await runPopulation(c, { outputDir: output });
    expect(report.status).toBe('failed');
    expect(report.sessions[0]?.issues.some((i) => i.title.includes('budget'))).toBe(true);
    expect(Date.now() - start).toBeLessThan(10000);
  });
  it('does not launch a browser for a pre-cancelled run', async () => {
    const abort = new AbortController();
    abort.abort();
    expect(
      (await runPopulation(config(), { outputDir: output, signal: abort.signal })).status,
    ).toBe('cancelled');
  });
});
