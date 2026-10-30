import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const require = createRequire(import.meta.url),
  JSZip = require('jszip');
const zip = await JSZip.loadAsync(await readFile('artifacts/ghosttown-0.1.0.vsix'));
for (const file of [
  'extension/dist/extension.cjs',
  'extension/dist/runner.cjs',
  'extension/dist/node_modules/playwright/package.json',
  'extension/dist/node_modules/playwright-core/package.json',
  'extension/media/studio/studio.js',
  'extension/media/studio/studio.css',
  'extension/resources/icon.png',
])
  assert(zip.file(file), `Missing ${file}`);
for (const name of Object.keys(zip.files))
  assert(
    !/\.local-browsers|\.env$|report\.json$/.test(name),
    `Unexpected private/browser artifact ${name}`,
  );
const destination = await mkdtemp(resolve('artifacts', 'vsix-check-'));
try {
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const file = resolve(destination, entry.name),
      rel = relative(destination, file);
    assert(!rel.startsWith('..') && !isAbsolute(rel));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await entry.async('nodebuffer'));
  }
  const runtime = join(destination, 'extension', 'dist', 'runner.cjs');
  assert(
    createRequire(runtime)
      .resolve('playwright')
      .startsWith(join(destination, 'extension', 'dist', 'node_modules')),
  );
  const { starterConfig, eventSchema } = await import('../packages/core/dist/index.js');
  const child = spawn(process.execPath, [runtime], {
    cwd: destination,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_PATH: '' },
  });
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  child.stdin.write(
    JSON.stringify({
      version: 1,
      type: 'run',
      runId: randomUUID(),
      config: starterConfig(),
      outputDir: join(destination, 'runs'),
    }) + '\n',
  );
  child.stdin.end(JSON.stringify({ version: 1, type: 'cancel' }) + '\n');
  const code = await new Promise((res, rej) => {
    child.on('exit', res);
    child.on('error', rej);
  });
  assert.equal(code, 0, stderr);
  const events = stdout
    .trim()
    .split('\n')
    .map((l) => eventSchema.parse(JSON.parse(l)));
  assert.equal(events.at(-1)?.payload.report?.status, 'cancelled');
  console.log(
    'PASS: VSIX runtime files, private-file exclusions, self-contained Playwright resolution, extracted runner protocol and cancellation',
  );
} finally {
  await rm(destination, { recursive: true, force: true });
}
