import { cp, mkdir, readFile, writeFile, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createVSIX } = require('@vscode/vsce');
const stage = resolve('artifacts/extension');
await mkdir(stage, { recursive: true });
await cp('apps/vscode-extension', stage, {
  recursive: true,
  filter: (src) =>
    !src.split(/[\\/]/).includes('node_modules') && !src.split(/[\\/]/).includes('src'),
});
// Both Playwright packages remain intact: cli.js and lib browser registry need their relative assets.
for (const name of ['playwright', 'playwright-core']) {
  const source = dirname(require.resolve(name + '/package.json'));
  await cp(source, join(stage, 'runtime', name), { recursive: true, dereference: true });
}
// Runtime libraries live next to dist in a private node_modules directory. vsce includes these via explicit negation.
await mkdir(join(stage, 'dist', 'node_modules'), { recursive: true });
for (const name of ['playwright', 'playwright-core'])
  await cp(join(stage, 'runtime', name), join(stage, 'dist', 'node_modules', name), {
    recursive: true,
  });
await writeFile(join(stage, '.vscodeignore'), 'src/**\n**/*.map\nruntime/**\n');
await createVSIX({
  cwd: stage,
  packagePath: resolve('artifacts/ghosttown-0.1.0.vsix'),
  dependencies: false,
  allowMissingRepository: true,
});
console.log('Created artifacts/ghosttown-0.1.0.vsix');
