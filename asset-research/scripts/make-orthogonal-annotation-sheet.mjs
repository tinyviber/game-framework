#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const assetRoot = resolve(scriptDir, '..');
const repoRoot = resolve(assetRoot, '..');
const metadataPath = resolve(repoRoot, 'src/assets/orthogonal/atlas-metadata.json');
const atlasPath = resolve(repoRoot, 'asset-research/cc0/puny-world/punyworld-overworld-tileset.png');
const outputDir = resolve(assetRoot, 'local/previews/orthogonal');
const outputPath = resolve(outputDir, 'puny-world-annotation-sheet.png');

if (process.argv[2] !== '--write-local') {
  console.error('Refusing to write annotation sheet without --write-local.');
  process.exit(2);
}

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
mkdirSync(outputDir, { recursive: true });
const temporaryDir = mkdtempSync('/tmp/game-orthogonal-annotation.');
const panels = [];

try {
  for (const region of metadata.regions) {
    const [x, y, width, height] = region.source_rect;
    const footprint = `${region.logical_footprint.width}×${region.logical_footprint.height}`;
    const label = [
      region.id,
      `${region.category} · ${region.surface} · ${region.walkable ? 'walkable' : 'blocked'}`,
      `h${region.height_class} · conf ${region.confidence} · footprint ${footprint}`,
    ].join('\n');
    const panelPath = resolve(temporaryDir, `${panels.length}.png`);
    execFileSync('magick', [
      atlasPath,
      '-crop', `${width}x${height}+${x}+${y}`,
      '+repage',
      '-filter', 'point',
      '-resize', '300%',
      '-background', '#20242e',
      '-gravity', 'north',
      '-extent', '280x220',
      '-gravity', 'south',
      '-splice', '0x86',
      '-fill', '#f4f1e8',
      '-pointsize', '13',
      '-interline-spacing', '1',
      '-annotate', '+0+24', label,
      panelPath,
    ], { stdio: 'inherit' });
    panels.push(panelPath);
  }

  execFileSync('magick', [
    'montage',
    ...panels,
    '-background', '#101820',
    '-tile', '2x',
    '-geometry', '+10+10',
    outputPath,
  ], { stdio: 'inherit' });
  console.log(`Wrote ${basename(outputPath)} for ${metadata.regions.length} annotated regions.`);
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}
