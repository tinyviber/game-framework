import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as comparison from './make-comparison-scenes.mjs';
import * as smoke from './render-cc0-smoke.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(scriptDir, '..');
const scene = JSON.parse(readFileSync(resolve(assetRoot, 'benchmark-scene-16x16.json'), 'utf8'));
const sources = JSON.parse(readFileSync(resolve(assetRoot, 'sources.json'), 'utf8'));
const sourceById = new Map(sources.sources.map((source) => [source.id, source]));

function operationsFrom(plan) {
  return plan.operations ?? plan.ops ?? plan;
}

function operationKind(operation) {
  return operation.kind ?? operation.type ?? operation.category;
}

function operationRole(operation) {
  return operation.role ?? operation.sourceRole;
}

function pngBytesFrom(result) {
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  if (Buffer.isBuffer(result?.bytes)) return result.bytes;
  if (result?.bytes instanceof Uint8Array) return Buffer.from(result.bytes);
  if (Buffer.isBuffer(result?.png)) return result.png;
  if (result?.png instanceof Uint8Array) return Buffer.from(result.png);
  const outputPath = result?.outputPath ?? result?.path;
  if (outputPath) return readFileSync(outputPath);
  throw new Error('CC0 smoke helper did not return PNG bytes or an output path');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertPng(bytes) {
  expect(bytes.length).toBeGreaterThan(100);
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  expect(bytes.readUInt32BE(16)).toBe(256);
  expect(bytes.readUInt32BE(20)).toBe(256);
  expect(bytes.includes(Buffer.from('IDAT'))).toBe(true);
  expect(bytes.includes(Buffer.from('IEND'))).toBe(true);
}

describe('asset benchmark regression contract', () => {
  it('keeps bridge ownership in the object layer of the schema-2 scene', () => {
    expect(scene.schema).toBe(2);
    expect(scene.legend).toEqual({ g: 'ground', p: 'path', w: 'water' });
    expect(new Set(scene.terrain.join(''))).toEqual(new Set(['g', 'p', 'w']));
    expect(Object.values(scene.legend)).not.toContain('bridge');
    expect(scene.objects.filter((object) => object.role === 'bridge')).toHaveLength(1);
  });

  it('plans no bridge terrain draw and exactly one bridge object draw', () => {
    expect(typeof comparison.buildRenderPlan).toBe('function');
    const plan = comparison.buildRenderPlan(sourceById.get('loomy-environment'), scene);
    const operations = operationsFrom(plan);
    expect(Array.isArray(operations)).toBe(true);

    expect(operations.filter((operation) => operationKind(operation) === 'terrain' && operationRole(operation) === 'bridge')).toHaveLength(0);
    expect(operations.filter((operation) => operationKind(operation) === 'object' && operationRole(operation) === 'bridge')).toHaveLength(1);
  });

  it('records native Loomy bridge geometry independently from its logical footprint', () => {
    const loomy = sourceById.get('loomy-environment');
    expect(loomy.tileSize).toBe(32);

    for (const source of ['fawf-village', 'loomy-environment', 'puny-world'].map((id) => sourceById.get(id))) {
      for (const role of Object.values(source.roles)) {
        if (role !== null) {
          expect(role).toMatchObject({
            sourceRect: expect.any(Array),
            logicalFootprint: { width: expect.any(Number), height: expect.any(Number) },
            visualBounds: { x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) },
            anchor: { x: expect.any(Number), y: expect.any(Number) },
            overflow: { left: expect.any(Number), top: expect.any(Number), right: expect.any(Number), bottom: expect.any(Number) },
          });
        }
      }
    }

    const bridge = loomy.roles.bridge;
    expect(bridge.sourceRect).toEqual([512, 64, 160, 160]);
    expect(bridge.logicalFootprint).toEqual({ width: 5, height: 3 });
    expect(bridge.visualBounds).toEqual({ x: 0, y: 0, width: 160, height: 160 });
    expect(bridge.anchor).toEqual({ x: 0, y: 0 });
    expect(bridge.overflow).toEqual({ left: 0, top: 0, right: 0, bottom: 64 });
    expect(bridge.sourceRect[2]).toBe(bridge.logicalFootprint.width * loomy.tileSize);
    expect(bridge.sourceRect[3] - bridge.logicalFootprint.height * loomy.tileSize).toBe(bridge.overflow.bottom);

    const bridgeOperation = operationsFrom(comparison.buildRenderPlan(loomy, scene))
      .find((operation) => operationKind(operation) === 'object' && operationRole(operation) === 'bridge');
    expect(bridgeOperation.sourceRect).toEqual(bridge.sourceRect);
    expect(bridgeOperation.logicalFootprint).toEqual(bridge.logicalFootprint);
    expect(bridgeOperation.visualBounds).toEqual(bridge.visualBounds);
    expect(bridgeOperation.anchor).toEqual(bridge.anchor);
    expect(bridgeOperation.overflow).toEqual(bridge.overflow);
    const destination = bridgeOperation.destinationRect ?? bridgeOperation.destRect ?? bridgeOperation.renderRect ?? bridgeOperation.destination;
    expect(destination).toMatchObject({ width: 160, height: 160 });
    expect(bridgeOperation.resize).toBeUndefined();
    expect(bridgeOperation.clip).toBeUndefined();
  });

  it('renders only tracked Puny into the pinned canonical 256px PNG', () => {
    const renderSmoke = smoke.renderCc0Smoke ?? smoke.renderPunySmoke ?? smoke.renderSmoke;
    expect(typeof renderSmoke).toBe('function');

    const renderable = sources.sources.filter((source) => source.ciRenderable === true);
    expect(renderable.map((source) => source.id)).toEqual(['puny-world']);
    expect(renderable[0].input).toBe('cc0/puny-world/punyworld-overworld-tileset.png');

    const result = renderSmoke();
    const bytes = pngBytesFrom(result);
    assertPng(bytes);
    expect(result.nonBackgroundPixels).toBeGreaterThan(0);
    expect(sha256(bytes)).toBe(renderable[0].benchmark.ciExpectedOutputSha256);
    if (result?.outputSha256) expect(result.outputSha256).toBe(renderable[0].benchmark.ciExpectedOutputSha256);
  });
});
