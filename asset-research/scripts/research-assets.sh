#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
asset_root="$(cd "$script_dir/.." && pwd)"
local_root="$asset_root/local"

usage() {
  echo "Usage: research-assets.sh {verify|prepare|preview|analyze|benchmark} [--write-local]" >&2
  exit 2
}

command="${1:-}"
[[ -n "$command" ]] || usage
shift || true

case "$command" in
  verify)
    node "$script_dir/check-repo-hygiene.mjs" --self-test
    node "$script_dir/check-repo-hygiene.mjs"
    node "$script_dir/make-comparison-scenes.mjs" verify
    ;;
  prepare)
    [[ "${1:-}" == "--write-local" ]] || { echo "prepare requires --write-local" >&2; exit 2; }
    mkdir -p "$local_root/downloads/fawf" "$local_root/downloads/loomy" "$local_root/extracted/fawf-village/assets" "$local_root/extracted/loomy-environment"
    fawf_zip="$local_root/downloads/fawf/16x16village-tileset.zip"
    loomy_png="$local_root/downloads/loomy/Environment_assets.png"
    if [[ -f "$fawf_zip" ]]; then
      unzip -oq "$fawf_zip" -d "$local_root/extracted/fawf-village"
    fi
    if [[ -f "$loomy_png" ]]; then
      cp "$loomy_png" "$local_root/extracted/loomy-environment/Environment_assets.png"
    fi
    for palette in village-palette01-day.png village-palette01-night.png village-palette02-day.png village-palette02-night.png village-palette03-day.png village-palette03-night.png; do
      target="$local_root/extracted/fawf-village/assets/$palette"
      if [[ ! -f "$target" ]]; then
        candidate="$(find "$local_root/extracted/fawf-village" -type f -name "$palette" -print -quit)"
        [[ -n "$candidate" ]] || { echo "Missing Fawf palette after prepare: $palette" >&2; exit 1; }
        cp "$candidate" "$target"
      fi
    done
    [[ -f "$local_root/extracted/loomy-environment/Environment_assets.png" ]] || { echo "Missing Loomy PNG in local/downloads/loomy/." >&2; exit 1; }
    echo "Prepared restricted inputs below asset-research/local/."
    ;;
  preview)
    [[ "${1:-}" == "--write-local" ]] || { echo "preview requires --write-local" >&2; exit 2; }
    bash "$script_dir/make-contact-sheets.sh" --write-local
    ;;
  analyze)
    [[ "${1:-}" == "--write-local" ]] || { echo "analyze requires --write-local" >&2; exit 2; }
    out="$local_root/analysis"
    bash "$script_dir/analyze-atlas.sh" --write-local --id fawf-village-palette01-day --input "$local_root/extracted/fawf-village/assets/village-palette01-day.png" --tile-size 16 --output "$out/fawf-village-palette01-day.json"
    bash "$script_dir/analyze-atlas.sh" --write-local --id loomy-environment --input "$local_root/extracted/loomy-environment/Environment_assets.png" --tile-size 32 --output "$out/loomy-environment.json"
    bash "$script_dir/analyze-atlas.sh" --write-local --id puny-world --input "$asset_root/cc0/puny-world/punyworld-overworld-tileset.png" --tile-size 16 --output "$out/puny-world.json"
    bash "$script_dir/analyze-atlas.sh" --write-local --id cc0-outdoor-32x32 --input "$asset_root/cc0/alternatives/outdoor-32x32/sheet.png" --tile-size 32 --output "$out/cc0-outdoor-32x32.json"
    bash "$script_dir/analyze-atlas.sh" --write-local --id cc0-overworld-16x16 --input "$asset_root/cc0/alternatives/overworld-16x16/tilemap.png" --tile-size 16 --output "$out/cc0-overworld-16x16.json"
    ;;
  benchmark)
    [[ "${1:-}" == "--write-local" ]] || { echo "benchmark requires --write-local" >&2; exit 2; }
    node "$script_dir/make-comparison-scenes.mjs" render --write-local
    ;;
  *) usage ;;
esac
