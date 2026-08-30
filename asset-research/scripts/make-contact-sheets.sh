#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
asset_root="$(cd "$script_dir/.." && pwd)"
local_root="$asset_root/local"
out="$local_root/previews/contact-sheets"
scale="${ASSET_PREVIEW_SCALE:-200}"

if [[ "${1:-}" != "--write-local" ]]; then
  echo "Refusing to write previews without --write-local." >&2
  exit 2
fi
tmp="$(mktemp -d /tmp/game-contact-sheets.XXXXXX)"
trap 'rm -rf "$tmp"' EXIT

make_panel() {
  local input="$1"
  local label="$2"
  local scale="$3"
  local output="$4"
  local title_height=48

  magick "$input" \
    -trim +repage -filter point -resize "${scale}%" \
    -background '#20242e' -alpha remove -alpha off \
    -bordercolor '#687386' -border 2 \
    -gravity north -splice "0x${title_height}" \
    -fill '#f4f1e8' -pointsize 22 -annotate +0+32 "$label" \
    "$output"
}

mkdir -p "$out"

fawf_dir="$local_root/extracted/fawf-village/assets"
fawf_scale="${FAWF_SCALE:-200}"
make_panel "$fawf_dir/village-palette01-day.png" 'palette 01 · day · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-01-day.png"
make_panel "$fawf_dir/village-palette01-night.png" 'palette 01 · night · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-01-night.png"
make_panel "$fawf_dir/village-palette02-day.png" 'palette 02 · day · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-02-day.png"
make_panel "$fawf_dir/village-palette02-night.png" 'palette 02 · night · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-02-night.png"
make_panel "$fawf_dir/village-palette03-day.png" 'palette 03 · day · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-03-day.png"
make_panel "$fawf_dir/village-palette03-night.png" 'palette 03 · night · 304×320 · 16×16' "$fawf_scale" "$tmp/fawf-03-night.png"
magick "$tmp/fawf-01-day.png" "$tmp/fawf-01-night.png" "$tmp/fawf-02-day.png" +append "$tmp/fawf-row-1.png"
magick "$tmp/fawf-02-night.png" "$tmp/fawf-03-day.png" "$tmp/fawf-03-night.png" +append "$tmp/fawf-row-2.png"
magick "$tmp/fawf-row-1.png" "$tmp/fawf-row-2.png" -append "$out/fawf-village-contact-sheet.png"

make_panel "$local_root/extracted/loomy-environment/Environment_assets.png" 'Basic Environment · 800×800 · 32×32' "$scale" "$out/loomy-environment-contact-sheet.png"
make_panel "$asset_root/cc0/puny-world/punyworld-overworld-tileset.png" 'Puny World · 432×1040 · 16×16' "$scale" "$out/puny-world-contact-sheet.png"

identify "$out"/*.png
