import { runTests, downloadAndUnzipVSCode } from '@vscode/test-electron';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('artifacts/extension-test-workspace', { recursive: true });
await build({
  entryPoints: ['tests/extension/host.ts'],
  outfile: 'artifacts/host-test.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
});
const vscodeExecutablePath =
  process.env.GHOSTTOWN_VSCODE_PATH ?? (await downloadAndUnzipVSCode('1.100.0'));
await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath: resolve(
    process.env.GHOSTTOWN_EXTENSION_PATH ?? 'apps/vscode-extension',
  ),
  extensionTestsPath: resolve('artifacts/host-test.cjs'),
  launchArgs: [
    resolve('artifacts/extension-test-workspace'),
    '--skip-welcome',
    '--skip-release-notes',
    '--disable-workspace-trust',
    '--disable-gpu',
    '--user-data-dir=' + resolve('artifacts/vscode-user'),
    '--extensions-dir=' + resolve('artifacts/vscode-extensions'),
  ],
});
