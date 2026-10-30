import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
await mkdir('artifacts', { recursive: true });
// npm_execpath points to pnpm when invoked via `pnpm test:packaging`.
// Resolve npm itself so npm pack/install retain the same semantics in CI.
const npm =
  process.platform === 'win32'
    ? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
function command(args, options = {}) {
  const r = spawnSync(process.execPath, args, { encoding: 'utf8', ...options });
  if (r.status !== 0) throw new Error(`${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}
const packed = [];
for (const dir of ['core', 'cli']) {
  const out = command([
    npm,
    'pack',
    `./packages/${dir}`,
    '--pack-destination',
    'artifacts',
    '--json',
    '--ignore-scripts',
  ]);
  const entry = JSON.parse(out)[0];
  assert(entry.files.every((f) => !f.path.includes('node_modules') && !f.path.includes('tests/')));
  packed.push(resolve('artifacts', entry.filename));
}
// Offline install uses matching packed runtime dependencies, never monorepo resolution.
for (const name of ['playwright', 'playwright-core', 'zod', '@types/node', 'undici-types']) {
  const resolver =
    name === 'undici-types' ? createRequire(require.resolve('@types/node/package.json')) : require;
  const dir = dirname(resolver.resolve(name + '/package.json'));
  const out = command([
    npm,
    'pack',
    dir,
    '--pack-destination',
    'artifacts',
    '--json',
    '--ignore-scripts',
  ]);
  packed.push(resolve('artifacts', JSON.parse(out)[0].filename));
}
const consumer = await mkdtemp(resolve('artifacts', 'consumer-'));
try {
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({ name: 'ghosttown-clean-consumer', version: '1.0.0', private: true }),
  );
  command(
    [
      npm,
      'install',
      '--offline',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--legacy-peer-deps',
      ...packed,
    ],
    { cwd: consumer },
  );
  assert.match(
    command([join(consumer, 'node_modules', 'ghosttown-cli', 'dist', 'bin.cjs'), '--version'], {
      cwd: consumer,
    }),
    /0.1.0/,
  );
  assert.match(
    command(
      [
        '--input-type=module',
        '-e',
        "import {starterConfig,checkBrowser} from 'ghosttown-core';if(starterConfig().version!==1)throw Error('bad import');console.log('esm ok')",
      ],
      { cwd: consumer },
    ),
    /esm ok/,
  );
  command(
    [
      '-e',
      "const {starterConfig}=require('ghosttown-core');if(starterConfig().version!==1)process.exit(1)",
    ],
    { cwd: consumer },
  );
  await writeFile(
    join(consumer, 'consumer.mts'),
    "import {runPopulation,starterConfig,type Report} from 'ghosttown-core'; const c=starterConfig(); const run:Promise<Report>=runPopulation(c,{outputDir:'./runs'}); void run;\n",
  );
  command(
    [
      require.resolve('typescript/bin/tsc'),
      '--strict',
      '--noEmit',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--typeRoots',
      join(consumer, 'node_modules', '@types'),
      join(consumer, 'consumer.mts'),
    ],
    { cwd: consumer },
  );
  const shim = process.platform === 'win32' ? 'ghosttown.cmd' : 'ghosttown';
  await readFile(join(consumer, 'node_modules', '.bin', shim));
  if (process.platform === 'win32') {
    const shimResult = spawnSync(
      'cmd.exe',
      ['/d', '/c', 'node_modules\\.bin\\ghosttown.cmd --version'],
      { cwd: consumer, encoding: 'utf8' },
    );
    assert.equal(shimResult.status, 0, shimResult.stderr);
    assert.match(shimResult.stdout, /0.1.0/);
  } else {
    const shimResult = spawnSync(join(consumer, 'node_modules', '.bin', shim), ['--version'], {
      cwd: consumer,
      encoding: 'utf8',
    });
    assert.equal(shimResult.status, 0, shimResult.stderr);
    assert.match(shimResult.stdout, /0.1.0/);
  }
  console.log(
    'PASS: packed allowlists, clean offline install, CLI executable shim, ESM and CommonJS imports, TypeScript declarations',
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}
