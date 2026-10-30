import { afterAll, beforeAll, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import {
  configSchema,
  presets,
  reportSchema,
  starterConfig,
  eventSchema,
  safePath,
} from '../../packages/core/src/index.js';

let server: ViteDevServer;
let target: string;
const output = resolve('artifacts/react-playground-acceptance');
beforeAll(async () => {
  await mkdir(output, { recursive: true });
  server = await createServer({
    configFile: resolve('fixtures/demo-react-app/vite.config.mjs'),
    server: { port: 0, strictPort: false, watch: { ignored: ['**/artifacts/**'] } },
    logLevel: 'error',
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Missing playground listener');
  target = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await server?.close();
});

it('runs the compiled CLI against the actual React playground: three failed registrations, then three verified repairs', async () => {
  const config = starterConfig(target);
  config.concurrency = 2;
  config.capture.traces = true;
  config.personas = [presets[0]!, presets[4]!, presets[5]!];
  config.scenarios = [
    configSchema.parse({
      ...config,
      scenarios: [
        {
          id: 'registration',
          name: 'Registration expected outcome',
          startPath: '/register',
          steps: [
            { type: 'fill', selector: '#email', value: 'synthetic@example.test' },
            { type: 'fill', selector: '#password', value: 'Synthetic-only-123' },
            { type: 'click', selector: 'button[type=submit]' },
            { type: 'assertText', selector: '#result', text: 'Account created' },
          ],
        },
      ],
    }).scenarios[0]!,
  ];
  const configPath = join(output, 'acceptance.config.json');
  async function invoke() {
    await writeFile(configPath, JSON.stringify(config, null, 2));
    return new Promise<{ code: number | null; report: ReturnType<typeof reportSchema.parse> }>(
      (res, rej) => {
        const child = spawn(
          process.execPath,
          [
            resolve('packages/cli/dist/bin.cjs'),
            'run',
            '--config',
            configPath,
            '--output',
            output,
            '--json',
          ],
          { shell: false },
        );
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('error', rej);
        child.on('close', (code) => {
          try {
            res({ code, report: reportSchema.parse(JSON.parse(stdout)) });
          } catch (error) {
            rej(new Error(`CLI did not produce a valid report: ${stderr}`, { cause: error }));
          }
        });
      },
    );
  }
  const broken = await invoke();
  expect(broken.code).toBe(1);
  expect(broken.report.transport).toBe('live');
  expect(broken.report.summary.failed).toBe(3);
  for (const session of broken.report.sessions) {
    expect(session.issues.some((issue) => issue.category === 'Verified Defect')).toBe(true);
    expect(session.screenshot).toBeTruthy();
    expect(session.trace).toBeTruthy();
    expect(
      (await readFile(join(output, broken.report.runId, session.screenshot!)))
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  }
  config.scenarios[0]!.startPath = '/register?fixed=1';
  const fixed = await invoke();
  expect(fixed.code).toBe(0);
  expect(fixed.report.summary.passed).toBe(3);
  expect(fixed.report.summary.issues).toBe(0);
  await writeFile(
    join(output, 'acceptance-summary.json'),
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        target,
        personas: config.personas.map((p) => p.id),
        broken: {
          runId: broken.report.runId,
          exitCode: broken.code,
          summary: broken.report.summary,
        },
        fixed: { runId: fixed.report.runId, exitCode: fixed.code, summary: fixed.report.summary },
      },
      null,
      2,
    ),
  );
}, 90000);

it('executes a real browser scenario through the runner extracted from the installable VSIX', async () => {
  const extracted = await mkdtemp(join(output, 'installed-vsix-'));
  try {
    const archive = await JSZip.loadAsync(
      await readFile(resolve('artifacts/ghosttown-0.1.0.vsix')),
    );
    for (const entry of Object.values(archive.files)) {
      if (entry.dir) continue;
      const destination = safePath(extracted, entry.name);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await entry.async('nodebuffer'));
    }
    const runner = join(extracted, 'extension', 'dist', 'runner.cjs');
    expect(
      createRequire(runner)
        .resolve('playwright')
        .startsWith(join(extracted, 'extension', 'dist', 'node_modules')),
    ).toBe(true);
    const config = starterConfig(target);
    config.scenarios[0]!.steps = [
      { type: 'assertVisible', selector: 'h1' },
      { type: 'assertText', selector: 'h1', text: 'Your first population.' },
    ];
    const runId = randomUUID();
    const child = spawn(process.execPath, [runner], {
      cwd: extracted,
      shell: false,
      env: { ...process.env, NODE_PATH: '' },
    });
    let stdout = '',
      stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const reportPromise = new Promise<ReturnType<typeof reportSchema.parse>>((res, rej) => {
      let pending = '';
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        pending += chunk;
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end);
          pending = pending.slice(end + 1);
          try {
            const event = eventSchema.parse(JSON.parse(line));
            if (event.type === 'run.completed' && event.payload.report) {
              child.stdin.end();
              res(event.payload.report);
            }
            if (event.type === 'runner.error') rej(new Error(event.payload.message));
          } catch (error) {
            rej(error);
          }
        }
      });
      child.on('error', rej);
      child.on('close', () => {
        if (!stdout.includes('run.completed'))
          rej(new Error('Packaged runner exited without results: ' + stderr));
      });
    });
    const exited = new Promise<number | null>((res, rej) => {
      child.on('close', res);
      child.on('error', rej);
    });
    const timeout = setTimeout(() => {
      child.stdin.end(JSON.stringify({ version: 1, type: 'cancel' }) + '\n');
    }, 20000);
    try {
      child.stdin.write(
        JSON.stringify({ version: 1, type: 'run', runId, config, outputDir: output }) + '\n',
      );
      const report = await reportPromise;
      expect(report.transport).toBe('live');
      expect(report.status).toBe('passed');
      expect(report.summary.passed).toBe(1);
      expect(await exited).toBe(0);
      await writeFile(
        join(output, 'packaged-runner-summary.json'),
        JSON.stringify(
          {
            testedAt: new Date().toISOString(),
            runId,
            transport: report.transport,
            status: report.status,
            summary: report.summary,
          },
          null,
          2,
        ),
      );
    } finally {
      clearTimeout(timeout);
      child.kill();
    }
  } finally {
    await rm(extracted, { recursive: true, force: true });
  }
}, 60000);
