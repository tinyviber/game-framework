#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd -P)"
asset_root="$(cd "$script_dir/.." && pwd -P)"

id=""
input=""
tile_size=""
output=""
write_local=0

while (($#)); do
  case "$1" in
    --id) id="${2:?missing value for --id}"; shift 2 ;;
    --input) input="${2:?missing value for --input}"; shift 2 ;;
    --tile-size) tile_size="${2:?missing value for --tile-size}"; shift 2 ;;
    --output) output="${2:?missing value for --output}"; shift 2 ;;
    --write-local) write_local=1; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ((write_local == 0)); then
  echo "Refusing to write atlas analysis without --write-local." >&2
  exit 2
fi
if [[ -z "$id" || -z "$input" || -z "$tile_size" || -z "$output" ]]; then
  echo "Usage: analyze-atlas.sh --id ID --input PATH --tile-size N --output PATH --write-local" >&2
  exit 2
fi
if [[ "$input" != /* ]]; then
  input="$(cd "$(dirname "$input")" && pwd -P)/$(basename "$input")"
fi
if [[ "$output" != /* ]]; then
  output="$(pwd -P)/$output"
fi
if [[ "$output" != "$asset_root/local/"* ]]; then
  echo "Analysis output must stay below asset-research/local/." >&2
  exit 2
fi
node "$script_dir/assert-local-atlas-path.mjs" "$asset_root" "$input" "$output"
if [[ ! -f "$input" ]]; then
  echo "Atlas not found: $input" >&2
  exit 1
fi
if ! [[ "$tile_size" =~ ^[1-9][0-9]*$ ]]; then
  echo "Tile size must be a positive integer." >&2
  exit 2
fi

read -r width height < <(printf '%s\n' "$(magick "$input" -format '%w %h' info:)")
channels="$(magick "$input" -format '%[channels]' info:)"
opaque="$(magick "$input" -format '%[opaque]' info:)"
quantum_depth="$(magick "$input" -format '%z' info:)"
if ((width % tile_size != 0 || height % tile_size != 0)); then
  echo "Atlas dimensions ${width}x${height} are not divisible by tile size ${tile_size}." >&2
  exit 1
fi

mkdir -p "$(dirname "$output")"
sha256="$(shasum -a 256 "$input" | awk '{print $1}')"

# This is intentionally an info-only read. No trim, resize, crop, or repage is
# applied, so origin, alignment, transparent padding, and native geometry stay
# available to a later metadata/adjacency pipeline.
node --input-type=module -e '
import { writeFileSync } from "node:fs";
const [id, input, tileSize, width, height, channels, opaque, quantumDepth, sha256, output] = process.argv.slice(1);
const tile = Number(tileSize);
const w = Number(width);
const h = Number(height);
const result = {
  schema: 1,
  id,
  input,
  sha256,
  native: { width: w, height: h, columns: w / tile, rows: h / tile },
  grid: {
    tileWidth: tile,
    tileHeight: tile,
    origin: [0, 0],
    spacing: [0, 0],
    alignment: "native image origin; no preview transform applied"
  },
  image: { channels, quantumDepth: Number(quantumDepth), opaque: opaque === "True" || opaque === "true" },
  transformations: []
};
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
' "$id" "$input" "$tile_size" "$width" "$height" "$channels" "$opaque" "$quantum_depth" "$sha256" "$output"

echo "Wrote native atlas metadata: $output"
