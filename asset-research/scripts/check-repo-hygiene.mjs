import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const assetRoot = resolve(repoRoot, 'asset-research');
const sourceManifestPath = resolve(assetRoot, 'sources.json');
const restrictedNames = [
  '16x16village-tileset.zip',
  'Environment_assets.png',
  'village-palette01-day.png',
  'village-palette01-night.png',
  'village-palette02-day.png',
  'village-palette02-night.png',
  'village-palette03-day.png',
  'village-palette03-night.png',
];

function fail(message) {
  console.error(`asset hygiene: ${message}`);
  process.exit(1);
}

function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot })
      .toString()
      .split('\0')
      .filter(Boolean);
  } catch (error) {
    fail(`could not inspect tracked files: ${error.message}`);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pathIsForbidden(path) {
  return (
    /(^|\/)local\//.test(path) ||
    /(^|\/)(downloads|extracted|contact-sheets)\//.test(path) ||
    restrictedNames.some((name) => path.endsWith(`/${name}`))
  );
}

function isAllowedTrackedPath(path) {
  if (path.startsWith('public/assets/')) return true;
  if (path === 'asset-research/README.md') return true;
  if (path === 'asset-research/classification.md') return true;
  if (path === 'asset-research/sources.json') return true;
  if (path === 'asset-research/benchmark-scene-16x16.json') return true;
  if (path.startsWith('asset-research/scripts/')) {
    return ['.mjs', '.sh'].includes(extname(path));
  }
  if (path.startsWith('asset-research/cc0/')) {
    return ['.png', '.txt'].includes(extname(path).toLowerCase());
  }
  return !path.startsWith('asset-research/');
}

function validateTrackedFiles(files) {
  const violations = files.filter((path) => pathIsForbidden(path) || !isAllowedTrackedPath(path));
  if (violations.length) {
    fail(`forbidden or unallowlisted tracked paths:\n${violations.map((path) => `  ${path}`).join('\n')}`);
  }
}

function validateSources() {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'));
  } catch (error) {
    fail(`cannot parse sources.json: ${error.message}`);
  }
  if (!Array.isArray(manifest.sources) || manifest.schema !== 1) {
    fail('sources.json must use schema 1 and contain sources[].');
  }

  for (const source of manifest.sources) {
    for (const field of ['id', 'title', 'author', 'sourceUrl', 'downloadUrl', 'license', 'attributionNotes', 'input', 'sha256']) {
      if (typeof source[field] !== 'string' || source[field].length === 0) {
        fail(`${source.id ?? '<unknown>'} is missing string field ${field}.`);
      }
    }
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail(`${source.id} has an invalid sha256.`);
    if (source.redistributable === true) {
      if (!source.input.startsWith('cc0/')) fail(`${source.id} is redistributable but not stored below cc0/.`);
      if (source.licenseClass !== 'CC0') fail(`${source.id} is redistributable without licenseClass CC0.`);
    } else if (source.redistributable === false) {
      if (!source.input.startsWith('local/')) fail(`${source.id} is restricted but its input is not local-only.`);
    } else {
      fail(`${source.id} must explicitly set redistributable.`);
    }

    const inputPath = resolve(assetRoot, source.input);
    if (!inputPath.startsWith(`${assetRoot}/`)) fail(`${source.id} input escapes asset-research/.`);
    if (existsSync(inputPath) && sha256(inputPath) !== source.sha256) {
      fail(`${source.id} input hash does not match sources.json.`);
    }
  }
}

function runSelfTest() {
  const forbidden = [
    'asset-research/local/benchmarks/x.png',
    'asset-research/downloads/fawf/16x16village-tileset.zip',
    'asset-research/extracted/loomy/Environment_assets.png',
    'asset-research/contact-sheets/fawf.png',
  ];
  const allowed = [
    'asset-research/cc0/puny-world/punyworld-overworld-tileset.png',
    'public/assets/mark/tree.png',
    'asset-research/scripts/analyze-atlas.sh',
  ];
  if (forbidden.some((path) => !pathIsForbidden(path))) fail('self-test missed a forbidden path.');
  if (allowed.some((path) => pathIsForbidden(path) || !isAllowedTrackedPath(path))) fail('self-test rejected an allowed path.');
  console.log('asset hygiene: self-test ok');
}

if (process.argv.includes('--self-test')) runSelfTest();
validateTrackedFiles(trackedFiles());
validateSources();
console.log('asset hygiene: ok');
