# Asset research (public-safe)

This directory keeps the research method public without redistributing the two
itch.io packs. Fawf Village and Loomy Pixie remain local-only because their
source pages permit use/modification but prohibit resale or redistribution of
the original or modified asset pack. Puny World and the alternatives under
`cc0/` are published here because their OpenGameArt pages mark them CC0.

## Repository boundary

Tracked:

```text
asset-research/README.md
asset-research/classification.md
asset-research/sources.json
asset-research/benchmark-scene-16x16.json
asset-research/scripts/
asset-research/cc0/
src/assets/orthogonal/atlas-metadata.json
src/assets/orthogonal/metadata.ts
src/assets/orthogonal/semantic-mapping.ts
```

Ignored local workspace:

```text
asset-research/local/downloads/fawf/
asset-research/local/downloads/loomy/
asset-research/local/extracted/
asset-research/local/previews/
asset-research/local/analysis/
asset-research/local/benchmarks/
asset-research/local/previews/orthogonal/
```

Put manually downloaded files in the two `local/downloads/` directories. The
scripts never download from the network and never write restricted or generated
imagery to a tracked path.

The generated playground's orthogonal renderer uses the tracked CC0 Puny World
atlas as its selected 2D source. Its reviewable region annotations live in
[`src/assets/orthogonal/atlas-metadata.json`](../src/assets/orthogonal/atlas-metadata.json);
native source rectangles are intentionally kept separate from logical
footprints, visual bounds, and anchors. Run
`npm run assets:annotate-orthogonal` to create the local-only annotated contact
sheet at `asset-research/local/previews/orthogonal/`.

## Sources and replacements

- Fawf Village: <https://fawf-art.itch.io/16x16-village-tileset>
- Loomy Pixie Environment: <https://loomy-pixie.itch.io/basic-environment-tileset-free>
- Primary CC0 candidate, Puny World: <https://opengameart.org/content/16x16-puny-world-tileset>
- CC0 32×32 replacement candidate, Outdoor 32x32 by Buch: <https://opengameart.org/content/outdoor-32x32-tileset>
- CC0 16×16 replacement candidate, 16x16 Overworld Tiles by ARoachIFoundOnMyPillow: <https://opengameart.org/content/16x16-overworld-tiles-0>

The complete source/download/license/hash/geometry record is in
[`sources.json`](sources.json). The CC0 candidates are actual public PNGs;
they are not presented as drop-in equivalents for the restricted packs.

## Pipeline

Preview generation is deliberately separate from atlas analysis:

```sh
# Public-only hygiene check; safe in CI.
bash asset-research/scripts/research-assets.sh verify

# Clean-checkout, ImageMagick-free CC0 render used by CI.
npm run assets:benchmark-cc0

# Local-only operations; requires the manually downloaded Fawf/Loomy files.
bash asset-research/scripts/research-assets.sh prepare --write-local
bash asset-research/scripts/research-assets.sh preview --write-local
bash asset-research/scripts/research-assets.sh analyze --write-local
bash asset-research/scripts/research-assets.sh benchmark --write-local
```

`preview` may trim, scale with nearest-neighbor, add backgrounds, and label
contact sheets. `analyze` reads the original atlas and retains native origin,
spacing, grid alignment, transparent padding, and bounds; it never consumes a
preview and never applies `-trim`, `-resize`, or `+repage` to analysis data.

## Benchmark geometry

The scene is schema 2 and uses only `g=ground`, `p=path`, and `w=water` in its
terrain layer. Bridges, stairs, trees, walls, buildings, rocks, and decoration
are placed objects; the bridge is represented exactly once as `bridge-river`
over the water base.

Each non-null source role mapping keeps gameplay and art geometry separate:

```text
sourceRect       native source pixels [x, y, width, height]
logicalFootprint logical cells occupied by the object
visualBounds     native pixels inside sourceRect
anchor           native-pixel placement point relative to sourceRect
overflow         intentional native-pixel visual overflow beyond the footprint
```

The renderer crops `sourceRect` at native size and places it at the logical
origin minus `anchor`; it never resizes art to fit the logical footprint. This
allows Loomy's 160×160 bridge sprite to have a 5×3 logical footprint plus 64px
bottom overflow. Loomy remains 32px/cell and is not reduced to 16px.

The benchmark uses one source-independent 16×16 logical scene. Output sizes
are native: Fawf 256×256 at 16 px/cell, Loomy 512×512 at 32 px/cell, and Puny
256×256 at 16 px/cell. Loomy is not reduced to 16 px. Outputs and the manifest
are local-only. The local full benchmark uses ImageMagick; the CI smoke lane
uses only the tracked CC0 Puny PNG and Node built-ins, writes to a temporary
directory, and checks a pinned canonical PNG hash
(`ab836e0183c3fdfe6f4d981302be8f6dd1bd51f466b1a3a37cd8e1183d7cdf9b`).

## Validation

```sh
node asset-research/scripts/check-repo-hygiene.mjs
npm test
npm run build
git diff --check
```

The hygiene check uses `git ls-files` and an explicit allowlist for
`asset-research/`; existing documented runtime assets under `public/assets/`
remain allowed.
