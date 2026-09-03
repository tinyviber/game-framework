#include <algorithm>
#include <cstdint>
#include <iostream>
#include <queue>
#include <random>
#include <utility>
#include <vector>

struct MapMeta {
    std::vector<std::vector<int> > grid;
    std::vector<std::vector<int> > height;
};

enum GroundType {
    GROUND_CEMENT = 0,
    GROUND_GRASS = 1,
    GROUND_DIRT = 2,
    GROUND_STONE = 3,
    GROUND_SAND = 4
};

class Random {
public:
    explicit Random(std::uint32_t seed) : rng_(seed) {}

    int randInt(int l, int r) {
        std::uniform_int_distribution<int> dist(l, r);
        return dist(rng_);
    }

    bool chance(int percent) {
        return randInt(1, 100) <= percent;
    }

private:
    std::mt19937 rng_;
};

static bool inBounds(int x, int y, int r, int c) {
    return 0 <= x && x < r && 0 <= y && y < c;
}

static int pickGroundExcept(Random& random, int base) {
    std::vector<int> candidates;
    for (int ground = GROUND_CEMENT; ground <= GROUND_SAND; ++ground) {
        if (ground != base) {
            candidates.push_back(ground);
        }
    }
    return candidates[random.randInt(0, static_cast<int>(candidates.size()) - 1)];
}

static void growConnectedPatch(
    std::vector<std::vector<int> >& grid,
    std::vector<std::vector<int> >& used,
    int groundType,
    int sx,
    int sy,
    int cc_cnt,
    Random& random
) {
    static const int dx[] = {-1, 1, 0, 0};
    static const int dy[] = {0, 0, -1, 1};

    const int r = static_cast<int>(grid.size());
    const int c = r == 0 ? 0 : static_cast<int>(grid[0].size());

    std::vector<std::pair<int, int> > frontier;
    frontier.push_back(std::make_pair(sx, sy));

    int grown = 0;

    while (!frontier.empty() && grown < cc_cnt) {
        const int index = random.randInt(
            0,
            static_cast<int>(frontier.size()) - 1
        );
        const std::pair<int, int> current = frontier[index];
        frontier[index] = frontier.back();
        frontier.pop_back();

        const int x = current.first;
        const int y = current.second;

        if (!inBounds(x, y, r, c) || used[x][y]) {
            continue;
        }

        used[x][y] = 1;
        grid[x][y] = groundType;
        ++grown;

        // cc_cnt is only an upper bound. A patch may stop naturally before
        // reaching it, which keeps the result from looking too uniform.
        if (grown >= 3 && random.chance(10)) {
            break;
        }

        std::vector<std::pair<int, int> > next;
        for (int dir = 0; dir < 4; ++dir) {
            const int nx = x + dx[dir];
            const int ny = y + dy[dir];
            if (!inBounds(nx, ny, r, c) || used[nx][ny]) {
                continue;
            }
            next.push_back(std::make_pair(nx, ny));
        }

        std::shuffle(next.begin(), next.end(), std::mt19937(random.randInt(0, 0x7fffffff)));

        for (std::size_t i = 0; i < next.size(); ++i) {
            if (random.chance(72)) {
                frontier.push_back(next[i]);
            }
        }
    }
}

MapMeta gen_room(
    int r = 40,
    int c = 40,
    std::uint32_t seed = 2026
) {
    Random random(seed);

    // We are generating a room / map, not a maze.
    const int base_ground_type = random.randInt(
        GROUND_CEMENT,
        GROUND_SAND
    );

    std::vector<std::vector<int> > grid(
        r,
        std::vector<int>(c, base_ground_type)
    );

    // Pure 2D version: keep height in the return type for comparison with
    // the original prototype, but every cell stays at height 0.
    std::vector<std::vector<int> > height(
        r,
        std::vector<int>(c, 0)
    );

    // used only controls where the generated variation patches have already
    // claimed cells. It does not describe gameplay walkability.
    std::vector<std::vector<int> > used(
        r,
        std::vector<int>(c, 0)
    );

    // Example: if the base is cement, create a few connected grass / dirt /
    // stone / sand patches on top of it.
    const int var_cnt = random.randInt(0, 3);
    std::vector<int> var_types;

    while (static_cast<int>(var_types.size()) < var_cnt) {
        const int candidate = pickGroundExcept(random, base_ground_type);
        if (std::find(var_types.begin(), var_types.end(), candidate)
            == var_types.end()) {
            var_types.push_back(candidate);
        }
    }

    for (std::size_t i = 0; i < var_types.size(); ++i) {
        const int patch_cnt = random.randInt(1, 4);

        for (int patch = 0; patch < patch_cnt; ++patch) {
            int sx = -1;
            int sy = -1;

            // Try a few times to find an unused seed cell.
            for (int attempt = 0; attempt < 32; ++attempt) {
                const int x = random.randInt(0, r - 1);
                const int y = random.randInt(0, c - 1);
                if (!used[x][y]) {
                    sx = x;
                    sy = y;
                    break;
                }
            }

            if (sx == -1) {
                continue;
            }

            // Maximum size of this connected component. The growth function
            // is intentionally allowed to stop before reaching cc_cnt.
            const int cc_cnt = random.randInt(
                6,
                std::max(6, r * c / 12)
            );

            growConnectedPatch(
                grid,
                used,
                var_types[i],
                sx,
                sy,
                cc_cnt,
                random
            );
        }
    }

    MapMeta result;
    result.grid = grid;
    result.height = height;
    return result;
}

#ifdef GEN_ROOM_STANDALONE
int main() {
    const MapMeta room = gen_room(40, 40, 2026);

    for (std::size_t i = 0; i < room.grid.size(); ++i) {
        for (std::size_t j = 0; j < room.grid[i].size(); ++j) {
            std::cout << room.grid[i][j]
                      << (j + 1 == room.grid[i].size() ? '\n' : ' ');
        }
    }
}
#endif
