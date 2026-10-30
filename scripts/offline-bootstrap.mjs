// Development fallback: copy dependency closures from explicitly supplied existing installations.
// Release artifacts never reference these paths. Normal setup is pnpm install --frozen-lockfile.
import { createRequire } from 'node:module';
import { readFile, realpath, cp, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
const installed = new Map();
async function packageRoot(name, from) {
  let search = from;
  while (true) {
    const candidate = join(search, 'node_modules', name);
    try {
      await access(join(candidate, 'package.json'));
      return realpath(candidate);
    } catch {}
    const parent = dirname(search);
    if (parent === search) break;
    search = parent;
  }
  const require = createRequire(join(from, 'package.json'));
  let entry;
  try {
    entry = require.resolve(name + '/package.json');
  } catch {
    entry = require.resolve(name);
  }
  let dir = dirname(await realpath(entry));
  while (true) {
    try {
      const p = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
      if (p.name === name) return dir;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Cannot locate ' + name);
    dir = parent;
  }
}
async function install(source, destination) {
  source = await realpath(source);
  const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  const existing = installed.get(pkg.name);
  if (existing === pkg.version) return;
  if (existing) destination = join(destination, 'node_modules', pkg.name);
  else destination = join(resolve('node_modules'), pkg.name);
  installed.set(pkg.name, pkg.version);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: (src) => !src.slice(source.length).split(/[\\/]/).includes('node_modules'),
  });
  for (const [name] of Object.entries({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
    try {
      await install(await packageRoot(name, source), destination);
    } catch (error) {
      if (!pkg.optionalDependencies?.[name]) throw error;
    }
  }
  console.log(`${pkg.name}@${pkg.version}`);
}
for (const source of process.argv.slice(2)) await install(source, resolve('node_modules'));
