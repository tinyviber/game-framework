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
  'terrain', 'cliff', 'water', 'stairs', 'wall', 'building', 'cave', 'tree',
  'movable-looking-object', 'bridge', 'decoration', 'character',
];
const sceneRoleToSourceRole = { ground: 'terrain', path: 'path', water: 'water' };
const layerOrder = { terrain: 10, traversal: 20, structure: 30, foreground: 40, character: 50 };
const mainSourceIds = ['fawf-village', 'loomy-environment', 'puny-world'];

export function fail(message) {
  throw new Error(`comparison benchmark: ${message}`);
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
  }
}

export function sha256(path) {
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
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail(`expected a PNG with an IHDR for ${path}.`);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function validateScene(scene) {
  if (scene.schema !== 2 || scene.width !== 16 || scene.height !== 16) fail('scene must be schema 2 and exactly 16x16.');
  if (JSON.stringify(scene.legend) !== JSON.stringify({ g: 'ground', p: 'path', w: 'water' })) {
    fail('scene legend must contain only g=ground, p=path, and w=water.');
  }
  if (!Array.isArray(scene.terrain) || scene.terrain.length !== scene.height) fail('scene terrain row count is invalid.');
  for (const row of scene.terrain) {
    if (typeof row !== 'string' || row.length !== scene.width) fail('every terrain row must be exactly 16 characters.');
    for (const symbol of row) if (!(symbol in scene.legend)) fail(`terrain symbol ${symbol} is missing from legend.`);
  }
  if (!Array.isArray(scene.objects)) fail('scene objects must be an array.');
  const ids = new Set();
  let bridgeCount = 0;
  for (const object of scene.objects) {
    if (ids.has(object.id)) fail(`duplicate scene object id ${object.id}.`);
    ids.add(object.id);
    if (!requiredRoles.includes(object.role)) fail(`unknown scene role ${object.role}.`);
    if (!Object.hasOwn(layerOrder, object.layer)) fail(`unknown scene layer ${object.layer}.`);
    if (![object.x, object.y, object.width, object.height].every(Number.isInteger) || !positiveInteger(object.width) || !positiveInteger(object.height)) {
      fail(`invalid bounds for scene object ${object.id}.`);
    }
    if (object.x < 0 || object.y < 0 || object.x + object.width > scene.width || object.y + object.height > scene.height) {
      fail(`scene object ${object.id} is outside the 16x16 canvas.`);
    }
    if (object.role === 'bridge') bridgeCount += 1;
  }
  if (bridgeCount !== 1) fail(`scene must contain exactly one bridge object, got ${bridgeCount}.`);
}

function expectedOverflow(mapping, source) {
  const logicalWidth = mapping.logicalFootprint.width * source.tileSize;
  const logicalHeight = mapping.logicalFootprint.height * source.tileSize;
  const left = mapping.visualBounds.x - mapping.anchor.x;
  const top = mapping.visualBounds.y - mapping.anchor.y;
  const right = mapping.visualBounds.x + mapping.visualBounds.width - mapping.anchor.x - logicalWidth;
  const bottom = mapping.visualBounds.y + mapping.visualBounds.height - mapping.anchor.y - logicalHeight;
  return {
    left: Math.max(0, -left),
    top: Math.max(0, -top),
    right: Math.max(0, right),
    bottom: Math.max(0, bottom),
  };
}

export function validateRoleMapping(mapping, source, role) {
  if (mapping === null) return;
  if (!mapping || typeof mapping !== 'object') fail(`${source.id}.${role} must be null or a geometry mapping.`);
  const rect = mapping.sourceRect;
  if (!Array.isArray(rect) || rect.length !== 4 || !rect.every(Number.isInteger) || rect.some((value, index) => index < 2 ? value < 0 : !positiveInteger(value))) {
    fail(`${source.id}.${role}.sourceRect must be [x,y,width,height] in native pixels.`);
  }
  const [x, y, width, height] = rect;
  if (x + width > source.native.width || y + height > source.native.height) fail(`${source.id}.${role}.sourceRect is outside native bounds.`);
  const footprint = mapping.logicalFootprint;
  if (!footprint || !positiveInteger(footprint.width) || !positiveInteger(footprint.height)) fail(`${source.id}.${role}.logicalFootprint must be positive logical cells.`);
  const bounds = mapping.visualBounds;
  if (!bounds || ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger) || bounds.x < 0 || bounds.y < 0 || !positiveInteger(bounds.width) || !positiveInteger(bounds.height)) {
    fail(`${source.id}.${role}.visualBounds must be positive native pixels relative to sourceRect.`);
  }
  if (bounds.x + bounds.width > width || bounds.y + bounds.height > height) fail(`${source.id}.${role}.visualBounds is outside sourceRect.`);
  const anchor = mapping.anchor;
  if (!anchor || ![anchor.x, anchor.y].every(Number.isInteger) || anchor.x < 0 || anchor.y < 0 || anchor.x > width || anchor.y > height) {
    fail(`${source.id}.${role}.anchor must be a native-pixel point inside sourceRect.`);
  }
  const overflow = mapping.overflow;
  if (!overflow || !['left', 'top', 'right', 'bottom'].every((key) => Number.isInteger(overflow[key]) && overflow[key] >= 0)) {
    fail(`${source.id}.${role}.overflow must contain non-negative native pixels.`);
  }
  const derived = expectedOverflow(mapping, source);
  if (JSON.stringify(overflow) !== JSON.stringify(derived)) fail(`${source.id}.${role}.overflow does not match visualBounds, anchor, and logicalFootprint.`);
}

export function validateSources(sources, scene, requireInputs = false) {
  if (sources.schema !== 2 || !Array.isArray(sources.sources)) fail('sources.json must use schema 2 and contain sources[].');
  const byId = new Map(sources.sources.map((source) => [source.id, source]));
  for (const id of mainSourceIds) if (!byId.has(id)) fail(`missing benchmark source ${id}.`);
  for (const source of sources.sources) {
    if (!source.native || !positiveInteger(source.native.width) || !positiveInteger(source.native.height) || !positiveInteger(source.tileSize)) fail(`${source.id} has invalid native geometry.`);
    if (source.native.width % source.tileSize !== 0 || source.native.height % source.tileSize !== 0) fail(`${source.id} native dimensions are not divisible by tileSize.`);
    if (!source.roles || typeof source.roles !== 'object') fail(`${source.id} has no roles map.`);
    if (mainSourceIds.includes(source.id)) {
      for (const role of requiredRoles) {
        if (!(role in source.roles)) fail(`${source.id} is missing role ${role}.`);
        validateRoleMapping(source.roles[role], source, role);
      }
      if (!source.benchmark || !source.benchmark.output.startsWith('local/benchmarks/')) fail(`${source.id} benchmark output must be local-only.`);
      for (const object of scene.objects) {
        const mapping = source.roles[object.role];
        if (mapping && (mapping.logicalFootprint.width !== object.width || mapping.logicalFootprint.height !== object.height)) {
          fail(`${source.id}.${object.role}.logicalFootprint must match scene object ${object.id}.`);
        }
      }
    }
    if (source.redistributable === true && !source.input.startsWith('cc0/')) fail(`${source.id} public input must be below cc0/.`);
    if (source.redistributable === false && !source.input.startsWith('local/')) fail(`${source.id} restricted input must be below local/.`);
  }
  const mainSources = mainSourceIds.map((id) => byId.get(id));
  for (const source of mainSources) {
    const inputPath = resolve(assetRoot, source.input);
    if (requireInputs || source.redistributable === true) {
      if (!existsSync(inputPath)) fail(`missing input ${inputPath}.`);
      const dimensions = imageDimensions(inputPath);
      if (dimensions.width !== source.native.width || dimensions.height !== source.native.height) fail(`${source.id} native dimensions do not match input.`);
    }
  }
  return { byId, mainSources };
}

export function buildRenderPlan(source, scene) {
  validateScene(scene);
  validateRoleMapping(source.roles.terrain, source, 'terrain');
  const operations = [{ kind: 'terrain', role: 'terrain', x: 0, y: 0, width: scene.width, height: scene.height }];
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const role = sceneRoleToSourceRole[scene.legend[scene.terrain[y][x]]];
      if (role !== 'terrain') operations.push({ kind: 'terrain', role, x, y, width: 1, height: 1 });
    }
  }
  const objects = [...scene.objects].sort((a, b) => (layerOrder[a.layer] - layerOrder[b.layer]) || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const object of objects) {
    const mapping = source.roles[object.role];
    const destinationRect = mapping ? {
      x: object.x * source.tileSize - mapping.anchor.x,
      y: object.y * source.tileSize - mapping.anchor.y,
      width: mapping.sourceRect[2],
      height: mapping.sourceRect[3],
    } : null;
    operations.push({
      kind: 'object',
      role: object.role,
      id: object.id,
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      logicalFootprint: { width: object.width, height: object.height },
      sourceRect: mapping?.sourceRect ?? null,
      visualBounds: mapping?.visualBounds ?? null,
      anchor: mapping?.anchor ?? null,
      overflow: mapping?.overflow ?? null,
      destinationRect,
    });
  }
  return { operations };
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
  magick(['-size', `${width}x${height}`, 'xc:none', '-fill', '#fff0a8', '-stroke', '#41365e', '-strokewidth', '2', '-draw', `circle ${cx},${cy} ${cx + radius},${cy}`, output]);
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
  const cell = source.tileSize;
  const canvasWidth = scene.width * cell;
  const canvasHeight = scene.height * cell;
  const input = resolve(assetRoot, source.input);
  const output = resolve(assetRoot, source.benchmark.output);
  const frames = new Map();
  const frameFor = (role) => {
    if (frames.has(role)) return frames.get(role);
    const mapping = source.roles[role];
    if (!mapping) return null;
    const framePath = join(temp, `${source.id}-${role}.png`);
    cropFrame(input, mapping.sourceRect, framePath);
    frames.set(role, framePath);
    return framePath;
  };
  const base = join(temp, `${source.id}-base.png`);
  solid(base, canvasWidth, canvasHeight, source.benchmark.background);
  const terrain = frameFor('terrain');
  const tiledTerrain = join(temp, `${source.id}-terrain-fill.png`);
  fillWithTile(terrain, canvasWidth, canvasHeight, tiledTerrain);
  overlay(base, tiledTerrain, 0, 0, temp, 0);
  const plan = buildRenderPlan(source, scene);
  let sequence = 1;
  for (const operation of plan.operations) {
    if (operation.kind === 'terrain' && operation.role !== 'terrain') {
      const frame = frameFor(operation.role);
      if (frame) overlay(base, frame, operation.x * cell, operation.y * cell, temp, sequence++);
    }
  }
  const missingRoles = new Set();
  for (const operation of plan.operations) {
    if (operation.kind !== 'object') continue;
    const mapping = source.roles[operation.role];
    let frame = mapping ? frameFor(operation.role) : null;
    if (operation.role === 'character') {
      frame = join(temp, `${source.id}-character-marker.png`);
      marker(frame, operation.width * cell, operation.height * cell);
    } else if (!frame) {
      missingRoles.add(operation.role);
      frame = join(temp, `${source.id}-${operation.role}-missing.png`);
      placeholder(frame, operation.width * cell, operation.height * cell);
    }
    const destination = operation.destinationRect;
    overlay(base, frame, destination?.x ?? operation.x * cell, destination?.y ?? operation.y * cell, temp, sequence++);
  }
  mkdirSync(dirname(output), { recursive: true });
  normalize(base, temp);
  copyFileSync(base, output);
  const dimensions = imageDimensions(output);
  if (dimensions.width !== canvasWidth || dimensions.height !== canvasHeight) fail(`${source.id} output dimensions changed unexpectedly.`);
  const operations = plan.operations;
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
    operationSummary: {
      terrainOps: operations.filter((operation) => operation.kind === 'terrain').length,
      objectOps: operations.filter((operation) => operation.kind === 'object').length,
      bridgeTerrainOps: operations.filter((operation) => operation.kind === 'terrain' && operation.role === 'bridge').length,
      bridgeObjectOps: operations.filter((operation) => operation.kind === 'object' && operation.role === 'bridge').length,
    },
  };
}

export function renderLocalBenchmarks() {
  const scene = readJson(scenePath);
  const sources = readJson(sourcesPath);
  validateScene(scene);
  const { mainSources } = validateSources(sources, scene, true);
  const temp = mkdtempSync(join(tmpdir(), 'asset-benchmark-'));
  try {
    const results = mainSources.map((source) => renderSource(source, scene, temp));
    const manifest = {
      schema: 2,
      scene: 'benchmark-scene-16x16.json',
      sceneSha256: sha256(scenePath),
      imageMagick: magick(['-version']).split('\n')[0],
      outputs: results,
    };
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

export function verifyRepository() {
  const scene = readJson(scenePath);
  const sources = readJson(sourcesPath);
  validateScene(scene);
  validateSources(sources, scene, false);
  const plan = buildRenderPlan(sources.sources.find((source) => source.id === 'loomy-environment'), scene);
  const bridgeTerrainOps = plan.operations.filter((operation) => operation.kind === 'terrain' && operation.role === 'bridge');
  const bridgeObjectOps = plan.operations.filter((operation) => operation.kind === 'object' && operation.role === 'bridge');
  if (bridgeTerrainOps.length !== 0 || bridgeObjectOps.length !== 1) fail('bridge render plan must contain zero terrain ops and one object op.');
  console.log('comparison benchmark: schema, geometry, bridge ownership, native sizes, and public inputs ok');
}

function isDirectInvocation() {
  return process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

if (isDirectInvocation()) {
  const command = process.argv[2] ?? 'verify';
  try {
    if (command === 'verify') verifyRepository();
    else if (command === 'render' && process.argv.includes('--write-local')) {
      const manifest = renderLocalBenchmarks();
      console.log(`Wrote ${manifest.outputs.length} native-size comparison scenes and ${manifestPath}`);
    } else fail('use `verify` or `render --write-local`.');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
