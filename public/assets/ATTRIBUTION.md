# 素材来源与许可（Art Assets Attribution）

## 当前状态：已安装，默认使用精灵渲染

已安装 Kenney Tiny Dungeon 的 CC0 素材。启动时会加载图集；如果文件缺失、不可读或
尺寸不匹配，渲染器会自动逐格回退到内置色块，不影响游戏运行。

## Kenney · Tiny Dungeon

- 包名：Kenney Tiny Dungeon
- 来源页：<https://kenney.nl/assets/tiny-dungeon>
- 实际下载 URL：<https://kenney.nl/media/pages/assets/tiny-dungeon/f8422efb44-1674742415/kenney_tiny-dungeon.zip>
- 下载日期：2026-08-28
- 许可：Creative Commons Zero（CC0 1.0）
- 图集：`tilemap_packed.png`，16×16 瓦片，12 列 × 11 行（192×176）
- 安装文件：
  - `public/assets/tiny-dungeon/tilemap_packed.png`
  - `public/assets/tiny-dungeon/LICENSE.txt`

许可文件来自下载包；包内声明素材可用于个人、教育和商业项目。署名不是强制要求，
但感谢 Kenney（<https://www.kenney.nl>）。

`src/rendering/tile-textures.ts` 中的帧坐标已按当前下载图集核对。若图集被删除、替换为
其他版本或损坏，`loadTileTextures` 返回 `null`，游戏自动回退为色块渲染。

## Kenney · Mark texture selection

新 adventure 体验使用 `/assets/mark` 中筛选出的 64×64 透明 3D 预览图：

- `kenney_platformer-kit.zip`：草地、高差块、树、角色、植物、道具；
- `kenney_modular-cave-kit_1.0.zip`：岩门与阶梯；
- `kenney_modular-buildings.zip`：三种房屋预览。

每个文件的来源 archive/member、目标文件、SHA-256 与尺寸记录在
`public/assets/mark/manifest.json`。原始许可证保存在 `public/assets/mark/licenses/`。
这些图片属于 Kenney 资产包，包内许可证声明为 CC0；本项目不在浏览器运行时读取 zip、FBX
或 GLB。
