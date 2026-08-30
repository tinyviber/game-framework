import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(scriptDir, '..');
const scenePath = join(assetRoot, 'benchmark-scene-16x16.json');
const sourcesPath = join(assetRoot, 'sources.json');
const manifestPath = join(assetRoot, 'local/benchmark-manifest.json');
const requiredRoles = [
  'terrain',
  'cliff',
  'water',
  'stairs',
  'wall',
  'building',
  'cave',
  'tree',
  'movable-looking-object',
  'bridge',
  'decoration',
  'character',
];
const layerOrder = { terrain: 10, traversal: 20, structure: 30, foreground: 40, character: 50 };
const mainSourceIds = ['fawf-village', 'loomy-environment', 'puny-world'];

function fail(message) {
  throw new Error(`comparison benchmark: ${message}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function magick(args) {
  try {
    return execFileSync('magick', args, { encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    fail(`ImageMagick command failed: ${args.join(' ')}\n${error.stderr ?? error.message}`);
  }
}

function imageDimensions(path) {
  const bytes = readFileSync(path);
  const pngSignature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== pngSignature || bytes.length < 24 || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail(`expected a PNG with an IHDR for ${path}.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function validateRect(rect, source, role) {
  if (rect === null) return;
  if (!Array.isArray(rect) || rect.length !== 4 || rect.some((value) => !Number.isInteger(value))) {
    fail(`${source.id}.${role} must be null or [x,y,width,height].`);
  }
  const [x, y, width, height] = rect;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > source.native.width || y + height > source.native.height) {
    fail(`${source.id}.${role} rect is outside native bounds.`);
  }
}

function validateScene(scene) {
  if (scene.schema !== 1 || scene.width !== 16 || scene.height !== 16) fail('scene must be schema 1 and exactly 16x16.');
  if (!Array.isArray(scene.terrain) || scene.terrain.length !== scene.height) fail('scene terrain row count is invalid.');
  for (const row of scene.terrain) {
    if (typeof row !== 'string' || row.length !== scene.width) fail('every terrain row must be exactly 16 characters.');
    for (const symbol of row) if (!(symbol in scene.legend)) fail(`terrain symbol ${symbol} is missing from legend.`);
  }
  if (!Array.isArray(scene.objects)) fail('scene objects must be an array.');
  const ids = new Set();
  for (const object of scene.objects) {
    if (ids.has(object.id)) fail(`duplicate scene object id ${object.id}.`);
    ids.add(object.id);
    if (!requiredRoles.includes(object.role)) fail(`unknown scene role ${object.role}.`);
    if (!Object.hasOwn(layerOrder, object.layer)) fail(`unknown scene layer ${object.layer}.`);
    if (![object.x, object.y, object.width, object.height].every(Number.isInteger) || object.width <= 0 || object.height <= 0) {
      fail(`invalid bounds for scene object ${object.id}.`);
    }
    if (object.x < 0 || object.y < 0 || object.x + object.width > scene.width || object.y + object.height > scene.height) {
      fail(`scene object ${object.id} is outside the 16x16 canvas.`);
    }
  }
}

function validateSources(sources, scene, requirePublicFiles) {
  if (sources.schema !== 1 || !Array.isArray(sources.sources)) fail('sources.json must use schema 1 and contain sources[].');
  const byId = new Map(sources.sources.map((source) => [source.id, source]));
  for (const id of mainSourceIds) if (!byId.has(id)) fail(`missing benchmark source ${id}.`);
  for (const source of sources.sources) {
    if (!source.roles || typeof source.roles !== 'object') fail(`${source.id} has no roles map.`);
    if (mainSourceIds.includes(source.id)) {
      for (const role of requiredRoles) {
        if (!(role in source.roles)) fail(`${source.id} is missing role ${role}.`);
        validateRect(source.roles[role]?.rect ?? null, source, role);
      }
    }
    if (!source.native || source.native.width <= 0 || source.native.height <= 0) fail(`${source.id} has invalid native dimensions.`);
    if (source.redistributable === true && !source.input.startsWith('cc0/')) fail(`${source.id} public input must be below cc0/.`);
    if (source.redistributable === false && !source.input.startsWith('local/')) fail(`${source.id} restricted input must be below local/.`);
  }
  const mainSources = mainSourceIds.map((id) => byId.get(id));
  for (const source of mainSources) {
    if (!source.benchmark || !source.benchmark.output.startsWith('local/benchmarks/')) fail(`${source.id} benchmark output must be local-only.`);
    if (source.benchmark.visualTileSize !== source.tileSize) fail(`${source.id} benchmark must use native tile size.`);
    const inputPath = resolve(assetRoot, source.input);
    if (requirePublicFiles || source.redistributable === true) {
      if (!existsSync(inputPath)) fail(`missing public input ${inputPath}.`);
      const dimensions = imageDimensions(inputPath);
      if (dimensions.width !== source.native.width || dimensions.height !== source.native.height) {
        fail(`${source.id} native dimensions do not match the input image.`);
      }
    }
  }
  return { mainSources };
}

function cropFrame(input, rect, output) {
  const [x, y, width, height] = rect;
  magick([input, '-crop', `${width}x${height}+${x}+${y}`, '+repage', output]);
}

function fillWithTile(tilePath, width, height, output) {
  magick(['-size', `${width}x${height}`, `tile:${tilePath}`, output]);
}

function solid(output, width, height, color) {
  magick(['-size', `${width}x${height}`, `xc:${color}`, output]);
}

function placeholder(output, width, height) {
  const halfX = Math.max(1, Math.floor(width / 2));
  const halfY = Math.max(1, Math.floor(height / 2));
  const draw = `rectangle 0,0 ${halfX - 1},${halfY - 1} rectangle ${halfX},${halfY} ${width - 1},${height - 1}`;
  magick(['-size', `${width}x${height}`, 'xc:#3b2948', '-fill', '#d966c7', '-draw', draw, output]);
}

function marker(output, width, height) {
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  const radius = Math.max(2, Math.floor(Math.min(width, height) / 3));
  magick([
    '-size', `${width}x${height}`, 'xc:none', '-fill', '#fff0a8', '-stroke', '#41365e', '-strokewidth', '2',
    '-draw', `circle ${cx},${cy} ${cx + radius},${cy}`, output,
  ]);
}

function overlay(base, layer, x, y, temp, sequence) {
  const next = join(temp, `composite-${sequence}.png`);
  magick([base, layer, '-geometry', `+${x}+${y}`, '-compose', 'over', '-composite', next]);
  renameSync(next, base);
}

function normalize(path, temp) {
  const next = join(temp, 'normalized.png');
  magick([path, '-strip', '-colorspace', 'sRGB', '-depth', '8', '-define', 'png:compression-level=9', '-define', 'png:compression-filter=0', '-define', 'png:compression-strategy=1', next]);
  renameSync(next, path);
}

function renderSource(source, scene, temp) {
  const cell = source.benchmark.visualTileSize;
  const canvasWidth = scene.width * cell;
  const canvasHeight = scene.height * cell;
  const input = resolve(assetRoot, source.input);
  const output = resolve(assetRoot, source.benchmark.output);
  const frames = new Map();
  const frameFor = (role) => {
    if (frames.has(role)) return frames.get(role);
    const roleData = source.roles[role];
    if (!roleData?.rect) return null;
    const framePath = join(temp, `${source.id}-${role}.png`);
    cropFrame(input, roleData.rect, framePath);
    frames.set(role, framePath);
    return framePath;
  };

  const base = join(temp, `${source.id}-base.png`);
  solid(base, canvasWidth, canvasHeight, source.benchmark.background);
  const terrain = frameFor('terrain');
  if (!terrain) fail(`${source.id} needs a terrain frame for the benchmark.`);
  const tiledTerrain = join(temp, `${source.id}-terrain-fill.png`);
  fillWithTile(terrain, canvasWidth, canvasHeight, tiledTerrain);
  overlay(base, tiledTerrain, 0, 0, temp, 0);

  let sequence = 1;
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const role = scene.legend[scene.terrain[y][x]];
      if (role === 'ground') continue;
      const frame = frameFor(role);
      if (frame) overlay(base, frame, x * cell, y * cell, temp, sequence++);
    }
  }

  const missingRoles = new Set();
  const objects = [...scene.objects].sort((a, b) => (layerOrder[a.layer] - layerOrder[b.layer]) || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const object of objects) {
    const width = object.width * cell;
    const height = object.height * cell;
    let frame;
    if (object.role === 'character') {
      frame = join(temp, `${source.id}-character-marker.png`);
      marker(frame, width, height);
    } else {
      frame = frameFor(object.role);
      if (!frame) {
        missingRoles.add(object.role);
        frame = join(temp, `${source.id}-${object.role}-missing.png`);
        placeholder(frame, width, height);
      }
    }
    overlay(base, frame, object.x * cell, object.y * cell, temp, sequence++);
  }

  mkdirSync(dirname(output), { recursive: true });
  normalize(base, temp);
  copyFileSync(base, output);
  const dimensions = imageDimensions(output);
  if (dimensions.width !== canvasWidth || dimensions.height !== canvasHeight) fail(`${source.id} output dimensions changed unexpectedly.`);
  return {
    id: source.id,
    title: source.title,
    output: source.benchmark.output,
    width: dimensions.width,
    height: dimensions.height,
    visualTileSize: cell,
    selectedVariant: source.benchmarkVariant,
    sourceSha256: sha256(input),
    outputSha256: sha256(output),
    missingRoles: [...missingRoles].sort(),
  };
}

function main() {
  const command = process.argv[2] ?? 'verify';
  const scene = readJson(scenePath);
  const sources = readJson(sourcesPath);
  validateScene(scene);
  const { mainSources } = validateSources(sources, scene, command === 'render');
  if (command === 'verify') {
    console.log('comparison benchmark: schema, roles, native sizes, and public inputs ok');
    return;
  }
  if (command !== 'render' || !process.argv.includes('--write-local')) {
    fail('use `render --write-local` to create ignored local benchmark PNGs.');
  }

  const temp = mkdtempSync(join(tmpdir(), 'asset-benchmark-'));
  try {
    const results = mainSources.map((source) => renderSource(source, scene, temp));
    const manifest = {
      schema: 1,
      scene: 'benchmark-scene-16x16.json',
      sceneSha256: sha256(scenePath),
      imageMagick: magick(['-version']).split('\n')[0],
      outputs: results,
    };
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`Wrote ${results.length} native-size comparison scenes and ${manifestPath}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
