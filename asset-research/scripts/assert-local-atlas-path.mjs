import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';

const [assetRootArg, inputArg, outputArg] = process.argv.slice(2);

function fail(message) {
  console.error(`atlas path guard: ${message}`);
  process.exit(2);
}

if (!assetRootArg || !inputArg || !outputArg) fail('expected asset root, input, and output paths.');

const assetRoot = realpathSync(assetRootArg);
const localRoot = resolve(assetRoot, 'local');

function isBelow(base, target) {
  const path = relative(base, target);
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`;
  return path !== '' && path !== '..' && !path.startsWith(parentPrefix) && !isAbsolute(path);
}

function existingPathRealpath(path) {
  let current = resolve(path);
  const suffix = [];
  try {
    if (lstatSync(current).isSymbolicLink()) fail('output must not be a symlink.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) fail(`cannot resolve path ${path}.`);
    suffix.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...suffix);
}

let input;
try {
  input = realpathSync(inputArg);
} catch {
  fail(`input does not resolve: ${inputArg}`);
}

const allowedInputRoots = [
  resolve(assetRoot, 'cc0'),
  resolve(localRoot, 'downloads'),
  resolve(localRoot, 'extracted'),
].filter(existsSync).map((path) => realpathSync(path));
if (!allowedInputRoots.some((root) => isBelow(root, input))) {
  fail('input must resolve below cc0/, local/downloads/, or local/extracted/.');
}

const output = existingPathRealpath(outputArg);
const localCanonical = existsSync(localRoot) ? realpathSync(localRoot) : localRoot;
if (!isBelow(localCanonical, output)) fail('output must resolve below asset-research/local/.');

console.log('atlas path guard: ok');
