# Asset classification

This is text-only qualitative research. It intentionally contains no source
pixels, contact sheets, or derived imagery, so it can remain in the public
repository.

Legend: `◎` clear coverage, `△` partial/approximate coverage, `—` not found or
not confirmed.

| Set | Visual style | Tile size | terrain | cliff | water | stairs | wall | building | tree | movable-looking object | bridge | decoration |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fawf Village | Dense 3/4 medieval village pixel art; three day and three night palettes | 16×16 | ◎ | — | ◎ | — | ◎ village/stone walls | ◎ three modular building styles | — | △ small props | — | ◎ signs, tables, shadows |
| Loomy Pixie Environment | Cozy earthy 3/4 top-down pixel art; deep green/brown/blue palette | 32×32 | ◎ | ◎ grass-top soil cliffs | ◎ river/water | ◎ standalone stone steps | ◎ stone walls/bridge masonry | △ cave/stone structures, no village kit | ◎ broadleaf, pine, dead trees | △ rocks, stumps/wood | ◎ stone bridge | ◎ flowers, mushrooms, bushes |
| Puny World | Bright old-school JRPG orthogonal pixel art; compact spritesheet | 16×16 | ◎ grass, dirt, path, sand | ◎ elevation pieces | ◎ river/sea/animated water | △ elevation connectors | ◎ building/castle walls | ◎ house/roof components | ◎ forest clusters and trees | △ resource nodes and box-like props | △ no dedicated bridge confirmed | ◎ plants, nodes, path/building details |
| CC0 Outdoor 32x32 | Purple cave/terrain pixel art; high-resolution JRPG-ish alternative | 32×32 | ◎ | △ cave ledges/walls | ◎ | — | △ cave wall | — | △ limited vegetation | ◎ rocks, stump-like props | — | △ sign/terrain details |
| CC0 16x16 Overworld | Minimal GBA/Fire Emblem-inspired overworld pixel art | 16×16 | ◎ grass/beach | — | ◎ water/ocean | — | — | — | ◎ small trees | — | — | △ sparse terrain details |

## Same-scene reading

The fixed benchmark intentionally makes missing semantics visible as a
checkerboard placeholder instead of silently substituting a different role.
The useful comparison is therefore not “which atlas has the most pixels”, but:

- whether cliff/height changes read immediately;
- whether stairs and bridge read as traversable affordances;
- whether trees and rocks read as blockers;
- whether the source's projection agrees with the logical north/up direction;
- how good the set looks after being placed in a map rather than viewed as an atlas.

The native-size benchmark keeps Loomy at 32×32. Scaling it down to 16×16 is
not a recommended comparison route; logical cell size and visual pixel size
are separate dimensions.
