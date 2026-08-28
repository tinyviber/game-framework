# Codex 任务 Prompt：为瓦片解谜游戏接入 Kenney CC0 贴图

> 使用方式：把下方整段（含代码块）原样粘贴给 Codex。它需要能联网下载素材、能读写文件、
> 能运行 `npm test` / `npm run build` / `npm run dev`。完成后按文末「交付要求」汇报。

---

## 任务

仓库：`/Users/wj/Documents/repos/game-framework`（TypeScript + Vite + PixiJS 8，vitest node 环境）。

这是一个已可玩的 2D 俯视角瓦片解谜游戏（5 个阶段全部完成，`npm test` 142/142 绿、`npm run build` 绿）。
当前渲染为纯色块占位（flat-color Graphics）。你的唯一任务：**下载 CC0 素材包并接入，
让游戏用真实精灵贴图渲染**，同时保留「素材缺失时自动回退色块」的能力，且不得破坏任何现有测试与架构规则。

## 架构红线（`src/architecture.test.ts` 强制执行，勿违反）

- `src/world/**` 必须是纯逻辑：不得 import pixi.js / `@/chapters` / `@/runtime` / `@/rendering`，不得在模块顶层触碰 DOM 或 localStorage。
- `src/rendering/**` 只能用 pixi.js，不得 import `@/world` / `@/chapters`。
- 游戏状态一律 deep-frozen、操作全有全无、拒绝操作按引用返回输入状态——这些都已实现，**不要改动 `src/world/tile-world.ts` 的游戏逻辑**。

## 现状（先读这些文件再动手）

- `src/rendering/tile-textures.ts`：已实现 `loadTileTextures(url): Promise<TileTextureSet | null>`。
  预期图集：**16×16 瓦片、12 列 × 9 行 = 192×144**（Kenney Tiny Dungeon 的 `tilemap_packed.png`）。
  帧图 `TINY_DUNGEON_FRAMES` 的坐标目前是**未经视觉验证的猜测值**——下载素材后必须逐帧核对。
- `src/rendering/tile-scene.ts`：`createTileSceneRenderer(scene, textures?)` 已支持双路径
  （有 textures → Sprite；null → 色块），精灵容器与 Graphics 已分离，逐格回退无需改动。
- `src/main.ts`：启动时 `loadTileTextures('/assets/tiny-dungeon/tilemap_packed.png')`，失败即回退，无需改动。
- `public/assets/ATTRIBUTION.md`：素材来源与安装指引（当前状态为「待安装」）。
- 命名帧清单：`floor, wall, player, door, doorOpen, plate, leverOn, leverOff, chest, chestOpened, block`。

## 执行步骤

### 1. 下载 Kenney Tiny Dungeon（CC0，首选）

- 主页：`https://kenney.nl/assets/tiny-dungeon`
- 下载链接是带哈希的 zip，通常形如
  `https://kenney.nl/media/pages/assets/tiny-dungeon/<hex>/kenney_tiny-dungeon.zip`。
  用 WebFetch/curl 抓取页面 HTML，正则提取 `kenney_tiny-dungeon\.zip` 的真实 URL 再下载。
- 若该站点失败，按顺序尝试备选（同为 CC0/免费）：
  1. Kenney "Puzzle Pack 2"（`https://kenney.nl/assets/puzzle-pack-2`）
  2. OpenGameArt 俯视角地牢 tileset（筛选 CC0/CC-BY，取直接文件 URL）
  3. itch.io 搜 "puzzle assets" / "top-down tileset"（免费包）
  4. CraftPix 免费 2D 精灵包
- 全部失败：**不要伪造素材**，直接回退色块并如实汇报（用户可手动提供）。

### 2. 放置素材

- 从 zip 中找到打包图集 PNG（Tiny Dungeon 为 `tilemap_packed.png`，16×16、192×144）。
- 放到：`public/assets/tiny-dungeon/tilemap_packed.png`
- 把 zip 内的许可文件（CC0）一并复制到 `public/assets/tiny-dungeon/`（如 `LICENSE.txt`）。
- 更新 `public/assets/ATTRIBUTION.md`：填实际包名、来源 URL、许可（CC0）、下载日期，并写明「已安装」。

### 3. 视觉核对并修正帧坐标（关键步骤）

- 用图像查看能力打开 `tilemap_packed.png`，逐帧确认 `TINY_DUNGEON_FRAMES` 里的 11 个
  [col, row] 坐标确实对应：地板(floor)、墙(wall)、玩家(player)、关着的门(door)、开着的门(doorOpen)、
  压力板(plate)、拉杆开(leverOn)、拉杆关(leverOff)、宝箱(chest)、开过的宝箱(chestOpened)、推块(block)。
- 凡是猜错的坐标，直接修改 `src/rendering/tile-textures.ts` 里的 `TINY_DUNGEON_FRAMES`。
- 若所选包不是 Tiny Dungeon（例如换了 Puzzle Pack 2 或其他 tileset），同步调整
  `TINY_DUNGEON_SHEET` 的几何常量（tileSize/columns/rows）与帧图；命名保持 11 项不变。

### 4. 验证

1. `npm test`——必须全绿（当前基线 142/142）。
2. `npm run build`——必须通过。
3. `npm run dev`，打开页面确认：
   - 地板/墙/玩家/门（开与关）/压板/拉杆（开与关）/宝箱（开与关）/推块都以精灵渲染；
   - 压板被压住时有按压指示（绿色圆点）；
   - 摄像机跟随、房间切换淡入淡出、机关交互全部正常；
   - 若你有截图能力，贴出 2 张截图（初始房间、hub 广场压板区域）。
4. 回退验证（可选但推荐）：临时把 PNG 改名，确认回到色块渲染且不报错，再改回来。

### 5. 交付要求

- 汇报：实际下载的包名+URL、放置的文件、`TINY_DUNGEON_FRAMES` 最终坐标、`npm test`/`npm run build` 输出摘要、
  浏览器验证结果（含截图路径或说明）、遗留问题。
- 约束：只允许改动 `src/rendering/tile-textures.ts`（帧图/几何）、`public/assets/**`；
  **不得改动** `src/world/**`、`src/main.ts` 的游戏逻辑、`src/rendering/tile-scene.ts`（除非发现确实需要微调，
  需在汇报中说明理由）、任何 `*.test.ts`。
- 保持「素材缺失 → 自动回退色块」的能力，确保 CI 与构建对素材不存在免疫。

## 背景速览（供你理解代码，不必改动）

- 房间数据在 `src/data/rooms/*.json`（0=地板 1=墙；doors/pressurePlates/levers/blocks/chests 均为 JSON 配置）。
- 世界逻辑 `src/world/tile-world.ts`：移动/推块/压板/拉杆/宝箱/门，事件走 `src/world/event-bus.ts`。
- 跨房间持久化（flag/开过的箱子/已触发的机关）在 `src/world/flags.ts` + `src/world/tile-world.ts` 的 CarriedState。
- 渲染层 `src/rendering/tile-scene.ts` 只消费纯视图模型，从不回读游戏状态。
