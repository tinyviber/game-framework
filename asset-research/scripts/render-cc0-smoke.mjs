import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(scriptDir, '..');
const scenePath = join(assetRoot, 'benchmark-scene-16x16.json');
const sourcesPath = join(assetRoot, 'sources.json');
const requiredTerrainRoles = new Set(['terrain', 'path', 'water']);
const layerOrder = { terrain: 10, traversal: 20, structure: 30, foreground: 40, character: 50 };
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fail(message) {
  throw new Error(`CC0 smoke render: ${message}`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${path}: ${error.message}`);
  }
}

function isBelow(base, target) {
  const path = relative(base, target);
  return path !== '' && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\') && !path.startsWith('/') && !path.includes('..' + String.fromCharCode(92));
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail('input is not a PNG.');
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) fail('truncated PNG chunk.');
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii');
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) fail('PNG chunk exceeds input.');
    const data = bytes.subarray(start, end);
    if (type === 'IHDR') {
      if (length !== 13) fail('invalid IHDR length.');
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset = end + 4;
  }
  if (!header || idat.length === 0) fail('PNG is missing IHDR or IDAT.');
  if (header.bitDepth !== 8 || header.colorType !== 6 || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    fail('smoke renderer accepts only non-interlaced 8-bit RGBA PNGs.');
  }
  const stride = header.width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== header.height * (stride + 1)) fail('PNG scanline length is invalid.');
  const rgba = Buffer.alloc(header.width * header.height * 4);
  let rawOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[rawOffset++];
    if (filter > 4) fail(`unsupported PNG filter ${filter}.`);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      const up = y > 0 ? rgba[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? rgba[(y - 1) * stride + x - 4] : 0;
      const value = raw[rawOffset++];
      const predicted = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upLeft);
      rgba[y * stride + x] = (value + predicted) & 0xff;
    }
  }
  return { width: header.width, height: header.height, rgba };
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, data]);
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 8 + data.length);
  return chunk;
}

function adler32(bytes) {
  let sum1 = 1;
  let sum2 = 0;
  for (const byte of bytes) {
    sum1 = (sum1 + byte) % 65521;
    sum2 = (sum2 + sum1) % 65521;
  }
  return ((sum2 << 16) | sum1) >>> 0;
}

function zlibStored(bytes) {
  const chunks = [Buffer.from([0x78, 0x01])];
  let offset = 0;
  do {
    const length = Math.min(65535, bytes.length - offset);
    const header = Buffer.alloc(5);
    header[0] = offset + length >= bytes.length ? 1 : 0;
    header.writeUInt16LE(length, 1);
    header.writeUInt16LE((~length) & 0xffff, 3);
    chunks.push(header, bytes.subarray(offset, offset + length));
    offset += length;
  } while (offset < bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(adler32(bytes), 0);
  chunks.push(checksum);
  return Buffer.concat(chunks);
}

export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) fail('RGBA buffer length does not match PNG dimensions.');
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const idat = zlibStored(scanlines);
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', header), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function color(hex) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(value)) fail(`invalid color ${hex}.`);
  return [Number.parseInt(value.slice(0, 2), 16), Number.parseInt(value.slice(2, 4), 16), Number.parseInt(value.slice(4, 6), 16), 255];
}

function fill(rgba, width, height, value) {
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = value[0];
    rgba[index * 4 + 1] = value[1];
    rgba[index * 4 + 2] = value[2];
    rgba[index * 4 + 3] = value[3];
  }
}

function crop(image, rect) {
  const [x, y, width, height] = rect;
  const rgba = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * image.width + x) * 4;
    image.rgba.copy(rgba, row * width * 4, sourceStart, sourceStart + width * 4);
  }
  return { width, height, rgba };
}

function composite(destination, destinationWidth, destinationHeight, source, x, y) {
  for (let sourceY = 0; sourceY < source.height; sourceY += 1) {
    const targetY = y + sourceY;
    if (targetY < 0 || targetY >= destinationHeight) continue;
    for (let sourceX = 0; sourceX < source.width; sourceX += 1) {
      const targetX = x + sourceX;
      if (targetX < 0 || targetX >= destinationWidth) continue;
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const targetIndex = (targetY * destinationWidth + targetX) * 4;
      const sourceAlpha = source.rgba[sourceIndex + 3];
      if (sourceAlpha === 0) continue;
      if (sourceAlpha === 255) {
        source.rgba.copy(destination, targetIndex, sourceIndex, sourceIndex + 4);
        continue;
      }
      const inverse = 255 - sourceAlpha;
      destination[targetIndex] = Math.round((source.rgba[sourceIndex] * sourceAlpha + destination[targetIndex] * inverse) / 255);
      destination[targetIndex + 1] = Math.round((source.rgba[sourceIndex + 1] * sourceAlpha + destination[targetIndex + 1] * inverse) / 255);
      destination[targetIndex + 2] = Math.round((source.rgba[sourceIndex + 2] * sourceAlpha + destination[targetIndex + 2] * inverse) / 255);
      destination[targetIndex + 3] = Math.min(255, sourceAlpha + Math.round(destination[targetIndex + 3] * inverse / 255));
    }
  }
}

function placeholder(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const dark = color('#3b2948');
  const bright = color('#d966c7');
  fill(rgba, width, height, dark);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) if ((x < width / 2) === (y < height / 2)) bright.forEach((value, channel) => { rgba[(y * width + x) * 4 + channel] = value; });
  return { width, height, rgba };
}

function marker(width, height) {
  const rgba = Buffer.alloc(width * height * 4);
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  const radius = Math.max(2, Math.floor(Math.min(width, height) / 3));
  const inner = color('#fff0a8');
  const outline = color('#41365e');
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const distance = Math.hypot(x - centerX, y - centerY);
    const value = distance <= radius ? inner : distance <= radius + 2 ? outline : null;
    if (value) value.forEach((channelValue, channel) => { rgba[(y * width + x) * 4 + channel] = channelValue; });
  }
  return { width, height, rgba };
}

function validateScene(scene) {
  if (scene.schema !== 2 || scene.width !== 16 || scene.height !== 16) fail('scene must be schema 2 and exactly 16x16.');
  if (JSON.stringify(scene.legend) !== JSON.stringify({ g: 'ground', p: 'path', w: 'water' })) fail('scene legend is not terrain-only.');
  if (!Array.isArray(scene.terrain) || scene.terrain.length !== 16 || scene.terrain.some((row) => typeof row !== 'string' || row.length !== 16 || [...row].some((symbol) => !scene.legend[symbol]))) fail('scene terrain is invalid.');
  if (!Array.isArray(scene.objects) || scene.objects.filter((object) => object.role === 'bridge').length !== 1) fail('scene must contain exactly one bridge object.');
}

function buildSmokePlan(source, scene) {
  const operations = [{ kind: 'terrain', role: 'terrain', x: 0, y: 0, width: scene.width, height: scene.height }];
  for (let y = 0; y < scene.height; y += 1) for (let x = 0; x < scene.width; x += 1) {
    const role = scene.legend[scene.terrain[y][x]] === 'ground' ? 'terrain' : scene.legend[scene.terrain[y][x]];
    if (role !== 'terrain') operations.push({ kind: 'terrain', role, x, y, width: 1, height: 1 });
  }
  const objects = [...scene.objects].sort((a, b) => (layerOrder[a.layer] - layerOrder[b.layer]) || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const object of objects) {
    const mapping = source.roles[object.role];
    operations.push({
      kind: 'object', role: object.role, id: object.id, x: object.x, y: object.y, width: object.width, height: object.height,
      sourceRect: mapping?.sourceRect ?? null,
      visualBounds: mapping?.visualBounds ?? null,
      anchor: mapping?.anchor ?? null,
      overflow: mapping?.overflow ?? null,
      destinationRect: mapping ? { x: object.x * source.tileSize - mapping.anchor.x, y: object.y * source.tileSize - mapping.anchor.y, width: mapping.sourceRect[2], height: mapping.sourceRect[3] } : null,
    });
  }
  return operations;
}

export function renderCc0Smoke({ verifyHash = false } = {}) {
  const scene = readJson(scenePath);
  const sources = readJson(sourcesPath);
  validateScene(scene);
  const renderable = sources.sources.filter((source) => source.ciRenderable === true);
  if (renderable.length !== 1 || renderable[0].id !== 'puny-world') fail('only tracked Puny World may be CI-renderable.');
  const source = renderable[0];
  if (source.redistributable !== true || source.licenseClass !== 'CC0') fail('CI source must be redistributable CC0.');
  const inputPath = resolve(assetRoot, source.input);
  if (!isBelow(resolve(assetRoot, 'cc0'), inputPath) || !existsSync(inputPath)) fail('CI source must resolve to an existing tracked cc0/ file.');
  let realInputPath;
  try {
    realInputPath = realpathSync(inputPath);
  } catch {
    fail('CI source path cannot be resolved physically.');
  }
  if (!isBelow(realpathSync(resolve(assetRoot, 'cc0')), realInputPath)) fail('CI source symlink escapes cc0/.');
  const inputBytes = readFileSync(realInputPath);
  if (sha256(inputBytes) !== source.sha256) fail('CI source hash does not match sources.json.');
  const input = decodePng(inputBytes);
  if (input.width !== source.native.width || input.height !== source.native.height) fail('CI source native dimensions do not match sources.json.');
  const cell = source.tileSize;
  const width = scene.width * cell;
  const height = scene.height * cell;
  const rgba = Buffer.alloc(width * height * 4);
  fill(rgba, width, height, color(source.benchmark.background));
  const plan = buildSmokePlan(source, scene);
  const frameCache = new Map();
  const frameFor = (role) => {
    if (frameCache.has(role)) return frameCache.get(role);
    const mapping = source.roles[role];
    const frame = mapping ? crop(input, mapping.sourceRect) : null;
    frameCache.set(role, frame);
    return frame;
  };
  const terrain = frameFor('terrain');
  for (let y = 0; y < scene.height; y += 1) for (let x = 0; x < scene.width; x += 1) composite(rgba, width, height, terrain, x * cell, y * cell);
  for (const operation of plan) {
    if (operation.kind !== 'terrain' || operation.role === 'terrain') continue;
    const frame = frameFor(operation.role);
    if (frame) composite(rgba, width, height, frame, operation.x * cell, operation.y * cell);
  }
  const missingRoles = new Set();
  for (const operation of plan) {
    if (operation.kind !== 'object') continue;
    let frame = frameFor(operation.role);
    if (!frame && operation.role === 'character') frame = marker(operation.width * cell, operation.height * cell);
    if (!frame) {
      missingRoles.add(operation.role);
      frame = placeholder(operation.width * cell, operation.height * cell);
    }
    const destination = operation.destinationRect ?? { x: operation.x * cell, y: operation.y * cell };
    composite(rgba, width, height, frame, destination.x, destination.y);
  }
  const background = color(source.benchmark.background);
  let nonBackgroundPixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const pixel = index * 4;
    if (rgba[pixel] !== background[0] || rgba[pixel + 1] !== background[1] || rgba[pixel + 2] !== background[2] || rgba[pixel + 3] !== background[3]) {
      nonBackgroundPixels += 1;
    }
  }
  if (nonBackgroundPixels === 0) fail('smoke render contains only the background color.');
  const bytes = encodePng(width, height, rgba);
  const outputSha256 = sha256(bytes);
  if (verifyHash && outputSha256 !== source.benchmark.ciExpectedOutputSha256) fail(`canonical output hash mismatch: ${outputSha256}`);
  return {
    bytes,
    width,
    height,
    outputSha256,
    sourceSha256: sha256(inputBytes),
    nonBackgroundPixels,
    missingRoles: [...missingRoles].sort(),
    operations: plan,
  };
}

function main() {
  const result = renderCc0Smoke({ verifyHash: process.argv.includes('--verify') });
  const temp = mkdtempSync(join(tmpdir(), 'cc0-smoke-'));
  try {
    const output = join(temp, 'puny-world-smoke.png');
    writeFileSync(output, result.bytes);
    const parsed = decodePng(result.bytes);
    if (parsed.width !== 256 || parsed.height !== 256 || result.bytes.length <= 100) fail('smoke output validation failed.');
    console.log(`CC0 smoke render ok: ${output} ${parsed.width}x${parsed.height} sha256=${result.outputSha256}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
