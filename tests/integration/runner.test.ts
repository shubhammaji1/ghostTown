import { it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eventSchema, starterConfig } from '../../packages/shared/src/index.js';
it('runs the compiled IPC runner and cancels it through validated commands', async () => {
  const output = await mkdtemp(join(process.cwd(), 'artifacts', 'ghosttown-ipc-'));
  const runId = randomUUID();
  const config = starterConfig('http://127.0.0.1:1');
  const child = spawn(process.execPath, ['packages/runner/dist/runner.cjs'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    let stdout = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stdin.write(
      JSON.stringify({ version: 1, type: 'run', runId, config, outputDir: output }) + '\n',
    );
    child.stdin.end(JSON.stringify({ version: 1, type: 'cancel' }) + '\n');
    const exit = await new Promise<number | null>((res, rej) => {
      child.on('exit', res);
      child.on('error', rej);
    });
    expect(exit).toBe(0);
    const events = stdout
      .trim()
      .split('\n')
      .map((line) => eventSchema.parse(JSON.parse(line)));
    expect(events.at(-1)?.payload.report?.status).toBe('cancelled');
    expect(events.every((e) => e.runId === runId)).toBe(true);
  } finally {
    child.kill();
    await rm(output, { recursive: true, force: true });
  }
});
