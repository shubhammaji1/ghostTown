import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url),
  JSZip = require('jszip');
const tests = JSON.parse(await readFile('artifacts/offline-tests.json', 'utf8'));
assert.equal(tests.success, true, 'Do not bundle a release with failed available tests');
const verification = {
  date: '2026-10-29',
  status: 'beta; production gates outstanding',
  environment: 'Windows; Node.js 22.17.0',
  checks: {
    typecheck: 'passed',
    build: 'passed',
    format: 'passed',
    frozenLockMetadata: 'passed',
    offlineTests: { passed: tests.numPassedTests, failed: tests.numFailedTests },
    npmCleanInstall: 'passed; executable shim, ESM, CommonJS, strict declarations',
    vsixArchive: 'passed; extracted runtime resolution and runner cancellation',
  },
  blocked: {
    liveHTTP: 'Node loopback connections denied: EACCES 127.0.0.1',
    registry: 'ENOTFOUND registry.npmjs.org',
    extensionHost: 'Windows EPERM/installation ACL failure',
    authenticatedAI: 'No provider account used',
    crossPlatform: 'CI provided; not run on macOS/Linux',
    marketplace: 'Not published; repository URLs and publisher validation required',
  },
};
await writeFile(
  'artifacts/verification-results.json',
  JSON.stringify(verification, null, 2) + '\n',
);
const archives = ['ghosttown-0.1.0.vsix', 'ghosttown-core-0.1.0.tgz', 'ghosttown-cli-0.1.0.tgz'];
const hashes = [];
for (const name of archives)
  hashes.push(
    createHash('sha256')
      .update(await readFile(join('artifacts', name)))
      .digest('hex') +
      '  ' +
      name,
  );
await writeFile('artifacts/SHA256SUMS.txt', hashes.join('\n') + '\n');
const zip = new JSZip();
const excluded = new Set([
  'node_modules',
  'artifacts',
  '.git',
  '.vscode-test',
  '.codex',
  '.agents',
  '.aws',
]);
async function add(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.endsWith('.txt') || entry.name.endsWith('.log'))
      continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await add(file);
    else if (entry.isFile())
      zip.file(
        'source/' + relative(process.cwd(), file).replaceAll('\\', '/'),
        await readFile(file),
      );
  }
}
await add(process.cwd());
const prompt = (await readdir('.')).find((n) => n.endsWith('.txt'));
if (prompt) zip.file('source/masterPrompt.txt', await readFile(prompt));
for (const name of [
  ...archives,
  'verification-results.json',
  'offline-tests.json',
  'SHA256SUMS.txt',
])
  zip.file('release/' + name, await readFile(join('artifacts', name)));
zip.file(
  'START_HERE.md',
  '# GhostTown 0.1.0 beta\n\nInstall release/ghosttown-0.1.0.vsix using VS Code → Extensions: Install from VSIX. Open source/ as the project folder. Read source/README.md and source/docs/verification.md before running. The project includes a deliberate registration failure in the React playground.\n\n23 available offline checks passed. Live HTTP, native editor integration, authenticated AI and cross-platform release gates remain unverified. This archive is not a production-readiness claim.\n',
);
const file = resolve('artifacts/GhostTown_0.1.0_Beta.zip');
await writeFile(
  file,
  await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  }),
);
console.log(file);
