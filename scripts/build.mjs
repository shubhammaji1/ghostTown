import { build } from 'esbuild';
import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const vite = spawnSync(
  process.execPath,
  [
    join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js'),
    'build',
    '--config',
    'webview/vite.config.mjs',
  ],
  { stdio: 'inherit' },
);
if (vite.status !== 0) process.exit(vite.status ?? 1);
const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  external: ['playwright', 'vscode'],
  sourcemap: false,
  logLevel: 'info',
};
for (const [input, outfile, format] of [
  ['packages/core/src/index.ts', 'packages/core/dist/index.js', 'esm'],
  ['packages/core/src/index.ts', 'packages/core/dist/index.cjs', 'cjs'],
  ['packages/cli/src/bin.ts', 'packages/cli/dist/bin.cjs', 'cjs'],
  ['packages/runner/src/index.ts', 'packages/runner/dist/runner.cjs', 'cjs'],
  ['apps/vscode-extension/src/extension.ts', 'apps/vscode-extension/dist/extension.cjs', 'cjs'],
])
  await build({ ...common, entryPoints: [input], outfile, format });
const tsc = spawnSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '--emitDeclarationOnly', '--outDir', 'artifacts/types'],
  { stdio: 'inherit' },
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);
await cp('artifacts/types/packages', 'packages/core/dist/types/packages', { recursive: true });
await writeFile(
  'packages/core/dist/index.d.ts',
  "export * from './types/packages/core/src/index.js';\n",
);
await copyFile('packages/runner/dist/runner.cjs', 'apps/vscode-extension/dist/runner.cjs');
for (const dir of ['packages/core', 'packages/cli', 'apps/vscode-extension'])
  await copyFile('LICENSE', `${dir}/LICENSE`);
