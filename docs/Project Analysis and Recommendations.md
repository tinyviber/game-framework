---
title: Game Framework · 项目分析与重构建议
status: addressed
updated: 2026-08-28
tags:
  - review
  - architecture
  - recommendations
---

# Game Framework · 项目分析与重构建议

本文档是对当前仓库的一次独立代码审查：列出做得好的地方、做得不好的地方，以及如果由我重新实现会采用的做法。分析范围覆盖 `src/` 全部源码、测试与设计文档。

---

## 1. 项目概览

这是一个 **puzzle-first 的游戏框架原型**，技术栈为 TypeScript + Vite + PixiJS 8 + Vitest。核心思想：

- 只维护"当前房间"的 Local World(immutable definitions + mutable object states + entry metadata);
- 世界修改走 **proposal → scope 校验 → 原子提交** 的管线；
- Closure 用 `canEnter / canExit / createPersistentEffect` 契约控制宏观 progression;
- 房间拓扑显式声明，可达性用 BFS 投影；
- 渲染是把 world state 投影成 view model，再交给 Pixi 绘制。

当前规模约 1900 行源码（含测试）,`npm test`48 个测试全部通过，`npm run build` 正常产出。

审查基准：以下评价以 `docs/Current Design Synthesis and Reconstruction Plan.md` 中项目自己声明的架构约束为标准，而不是套用一个通用引擎的期待。

---

## 2. 做得好的地方

### 2.1 设计文档质量罕见地高

`docs/Current Design Synthesis and Reconstruction Plan.md` 是项目最突出的资产：

- **显式记录"不做什么"**(ECS、Universal Event Bus、全局 Tick、Phaser、React 等），而且每条都给出"等待证据"的引入条件；
- 词汇边界清晰：`PlayerAction / WorldOperation / StateTransform / ObjectChange / Event / RoomTransition` 各属于哪一层、是否允许改 state，全部有定义；
- Chapter 重建计划每章都有"最小可执行版本 + 独立测试命令"，并且明确"测试不许引用未来章节";
- 针对 LLM 协作的可执行约束（依赖方向、命名约定、验收命令）直接写在文档里。

对主要由 LLM 维护的仓库来说，这种文档比代码本身更能防止架构漂移。

### 2.2 分层边界真实存在，不只是文档口号

- `src/world/*` 完全没有 Pixi 依赖，纯状态、纯校验、纯函数；
- chapter 持有 level-specific 规则（`gate-yard.ts`、`npc-closure.ts`);
- 渲染分两段：`world-view.ts`(state → plain view model)和 `pixi-view.ts`(view model → Graphics)，后者可以脱离浏览器测试；
- 依赖方向与文档声明一致，测试可以在 node 环境跑全部 world 逻辑。

### 2.3 原子 Operation 管线是框架的核心亮点

`src/world/operation.ts` 的 `applyScopedOperation`：

- 先 `structuredClone` 出 draft 交给 operation;
- 校验 closure 匹配、scope 白名单、对象存在性、kind 匹配、`isObjectState` 有效性；
- 全部通过才生成 new state，任一非法 change 立即整个拒绝；
- rejection reason 是 typed tagged union(`closure-mismatch | scope-violation | unknown-object | kind-mismatch | invalid-proposal | operation-threw`)。

配套测试（`chapter-3/operation.test.ts`）质量很高，包括一个非常关键的测试：**operation 试图 push 自己的 `allowedObjectIds` 扩大 scope 被拒绝**——这类"恶意越权"测试正是框架权限模型该冻结的边界。

### 2.4 Immutability 纪律执行到位

- `createRoomDefinition` 克隆 + `deepFreeze`，测试验证 definition snapshot 与原始数据深层隔离；
- entry、persistent metadata 在初始化时被克隆，外部修改不反向污染；
- definition 是 immutable、object state 是 per-room mutable——这个二分在整个代码库里贯彻一致。

### 2.5 Branded Id 类型 + 构造器校验

`ObjectId / RoomId / ClosureId` 是 unique-symbol branded string,`createObjectId` 等构造器拒绝空串。以一个 class 的成本换来防止 string 混用，值得。

### 2.6 Closure 契约的 "Prove, Don't Check" 设计

`closure.ts` 的 `canExit` 检查的是**世界状态本身的证明**（门开、障碍清、主角到出口）而不是某个 boolean flag。这是设计上正确且代码上落实了的一点。

### 2.7 拓扑与可达性是显式模型

`topology.ts` 显式声明 `RoomRoute[]`,BFS 投影处理 loop、并对 `canTraverse` predicate 传入克隆的 metadata(predicate 副作用无法污染持久状态，且有测试锁住）。路线不隐式反向推导，requires shortcut 要显式写出——几何正确。

### 2.8 Session 组合式编排

`game-session.ts` 把 operation/closure/topology/checkpoint 四个原语**组合**起来，不引入继承或上帝类。每个原语保持独立可测，session 只做"调顺序 + 提交 persistent effect + 清 checkpoint"。

### 2.9 测试分布策略正确

每个 primitive 旁边有小而具体的行为测试，覆盖边界不变量（克隆隔离、scope 快照冻结、deepFreeze、A→B→A 重建、checkpoint 身份校验），而不是堆几个大集成测试。对 LLM 来说，这种测试是最有效的"边界冻结工具"。

---

## 3. 做得不好的地方与风险

按严重程度从高到低排列。

### 3.1 [高] `isObjectState` 的手工校验无法随 kind 扩展

`types.ts` 里 `ObjectState` 是一个封闭联合，`isObjectState` 是手写的 switch,**每个 case 的判断逻辑与类型定义相距甚远**。后果：

- 新 chapter 增加一种 kind（比如 `'lever'`)，必须同时修改 `types.ts` 里的联合与 `isObjectState`，漏改后者时，所有针对该 kind 的 operation 全部以 `invalid-proposal` 被拒,**运行时静默失败，编译器帮不上忙**;
- 校验逻辑不可复用：chapter 无法声明自己私有的 kind。

这违反了项目自己"level-specific gameplay semantics"的目标——扩展点实际上在中央类型文件里。

### 3.2 [高] 反馈通道是 string 嗅探，与文档自己的 Event 定义矛盾

`LocalWorldState.lastOperation` 是 `string | null`,`world-view.ts` 靠 `lastOperation === 'move-blocked-by-gate'` 和 `startsWith('move')` 推导 `blocked/action/failureReason`。问题：

- `label` 是可选的（`label?: string`)，静默丢失反馈；
- 任何改 label 字符串的人都会静默改坏 view;
- 文档明确说 Event 应该是显式、typed 的反馈，不该是权限入口——现在它既不是类型安全的，又承担了反馈总线职责。

这是设计文档与实现最明显的一处不一致。

### 3.3 [高] 规则里硬编码坐标，缺少碰撞/邻接查询原语

`gate-yard.ts` 里 `entersGate = nextX === 2`、激活要求 `mainCharacter.position.x !== 1` 不通过就 noop。这些 **magic numbers 耦合了 static object position 与 movement 规则**:

- 把门挪到 x=3，规则逻辑和 view 两处都要记得改；
- 对第二个 closure 来说，同样的"踩在某格才能激活"逻辑要再写一遍；
- 文档明确说"20–100 行的 primitive 能解决问题就不要引入大框架"——这里恰恰缺一个 20 行的 `objectsAt(position)` / `isBlocked(position)` 查询原语。

另外 **movement 没有边界校验**:`move-main-character` 对 deltaX=-1 从 x=0 会走到 x=-1，主角可以走出世界。closure 内是网格世界，room definition 却不声明 bounds。

### 3.4 [中] 克隆策略是"每层都全量防御克隆"，成本与不变量不对称

一次 accepted operation 的实际克隆次数：

1. `game-session`:`copyForResult(session.activeWorld)` 一次；
2. `applyScopedOperation`:`clonePlainData(state)` 出 draft 一次；
3. accept 时再 `clonePlainData({...state, objects: nextObjects})` 一次；
4. 每个 change state 单独 clonePlainData 一次。

rejection 路径上还有 `safeCopy(state)`。**每次玩家按一次按钮，整个 world state(所有对象、entry、metadata）至少被 structuredClone 3 次**。当前房间只有 4 个对象时无所谓，但项目自己的性能边界是"当前房间几百个对象"——按这个策略，每次操作都是 O(对象总数) 的深克隆，而文档里承认的优化方向（selective copy → structural sharing）其实应该是**初始实现方式**，而不是优化。

同时 `copyForResult / safeCopy` 的 `catch { return state; }` 分支是个隐患：如果哪天 metadata 里混入不可克隆值，`structuredClone` 抛异常后会**直接返回原对象的引用**,immutability 契约在错误路径上被静默破坏。宁可硬失败。

### 3.5 [中] 双层重复校验，职责归属模糊

`transitionRoom` 先 `target.validateEntry(safeEntry)`，然后 `initializeLocalWorld` 内部又对同一个 definition 再做一次 `validateEntry` 加身份/对象完整性校验。校验被调两次、但两处对"invalid entry"给出的 reason 不同步（`invalid-entry-parameters` vs 抛 Error)。**入口校验的归属应该在 `initializeLocalWorld` 一处**,transition 层只做路由发现与参数传递。

### 3.6 [中] `world-scene` 的 WeakMap 单例是隐藏的全局注册表

- `createWorldScene(root)` 若已有 scene 会**静默返回旧 scene**，不报错；
- `getWorldScene(root)` 是 create-or-get 的混合语义；
- 调用方（`renderChapter6`）不知道 scene 是谁创建、谁负责 destroy。

渲染管线里本该有一个明确的所有者（host)create/destroy scene，而不是一个模块级 WeakMap 充当隐式注册表。

### 3.7 [中] Pixi 渲染每帧全量重建 Graphics

`renderChapter6` 先 `scene.clear()`(destroy 所有子对象）再按 layer 重建所有 diamond/rect/ellipse。对于"每次点击触发一次完整重建"的现状可以工作，但：

- 这 allocation churn 是可预见的 GC 热点；
- 文档里把 renderer reconciliation 列为"等待证据"，同时这又是**当前唯一的渲染策略**——连一个对象 id → Graphics 的浅映射都没有，从第一性来说是实现路径选择问题，不是优化；
- CELL_SIZE、VIEWPORT 常量分散在 `pixi-view.ts`、`pixi-host-config.ts`、`world-view.ts` 三个文件里，改一处忘其他。

### 3.8 [低] Chapter 通过 `@/world` barrel 反向引入，违反文档内部规则

文档明确声明："world primitives 内部直接导入 types,**不反向依赖 barrel**"。但 `gate-yard.ts`、`npc-closure.ts` 都从 `@/world/index.ts` 桶文件导入(createClosureId、initializeLocalWorld……)。barrel `index.ts` re-export 了包括 `transition` 在内的所有模块，形成潜在的循环依赖通路与 tree-shaking 噪声。轻微，但既然文档把它写成约束，就该一致执行。

### 3.9 [低] `main.ts` 的接线方式没有兑现 PlayerAction 分层

- 模块级 `let worldState` 原味可变全局；
- 按钮直接调用 chapter operation 的 union，没有 `PlayerAction` 中间层（文档第 4 节定义的词汇在入口处不存在）;
- IIFE 启动、没有 HMR/destroy 清理路径。

作为 12 章的"浏览器入口"可以接受，但它是新 chapter 会复制的模板，模板会把"按钮直接调用 gameplay union"的 pattern 扩散下去。

### 3.10 [低] 其它小问题

- 仓库根没有 README（只有 docs/ 里一份长文档），首次进入成本高；
- `RoomDefinition.validateEntry` 签名接收 `RoomEntryParameters`(JsonRecord),chapter 里 `entry.spawnX as number` 强转，类型系统参与不了;
- `deepFreeze` 在每条 route clone 后递归走一遍对象图，定义创建是无所谓，但没有 memo/循环保护（纯 JSON 情况下 OK，仅指出假设前提）;
- `operation.ts` 里 duplicate-id 检查（`seenObjectIds`）的校验顺序夹在 unknown-object 和 kind-mismatch 之间，order 无文档无测试意图，属于代码洁癖层面；
- style.css 固定 900px 宽,`pixi-host-config` 的默认 viewport 以及 `pixi-view` 内部 VIEWPORT 各自硬编码 900×440，三处重复。

---

## 4. 如果我来实现，我会怎么做

以下按优先级排序。这一部分不是推翻重写，而是针对第 3 节的问题给出**同一代码体量、更低耦合**的实现路线。

### 4.1 把 ObjectState 校验改成 per-kind 注册表（解决 3.1)

把 validator 从"中央 switch"改成"kind → validator 的映射"，允许 chapter 注册私有 kind:

```ts
// world/object-state.ts
export interface ObjectStateKind<K extends string> {
  readonly kind: K;
  readonly validate: (state: unknown) => boolean;
}

const registry = new Map<string, ObjectStateKind<any>>();

export function registerObjectKind<K extends string>(
  kind: ObjectStateKind<K>,
): void { /* 一次性注册，重复注册报错 */ }

export function isObjectState(value: unknown): boolean {
  // 查 registry，未注册 kind 直接 false
}
```

- 内建 kind(main-character/npc/mechanism/door/obstacle）在 world 包内注册；
- chapter 的私有 kind（比如 lever、pressure-plate）在 chapter 模块里自查自验；
- **新增 kind 不再需要改 `types.ts`**，中央联合类型甚至可以退化为 `{ kind: string; … }` 的开放接口，类型安全通过泛型+注册获得。

代价是一个 ~40 行的 registry primitive，收益是对象的"开放扩展点"与文档宣称的 level-specific semantics 真正对齐。

### 4.2 反馈改为 typed event，而不是 string label（解决 3.2)

把 `lastOperation: string | null` 改为 `lastEvents: readonly OperationEvent[]`,OperationProposal 里 `label` 换成：

```ts
export type OperationEvent =
  | { readonly tag: 'move-blocked'; readonly by: ObjectId }
  | { readonly tag: 'object-activated'; readonly target: ObjectId }
  | { readonly tag: 'move'; readonly objectId: ObjectId };

export interface OperationProposal {
  readonly events?: readonly OperationEvent[]; // 必带“发生过什么”的结构化描述
  readonly changes: readonly ObjectChange[];
}
```

- `world-view.ts` 不再 `startsWith('move')`，改为 switch event.tag，类型系统兜底缺失分支；
- chapter 拥有"自己 chapter 的 event 词汇"，与 level-specific semantics 一致；
- docs 第 4 节的 Event 定义与实现重新一致。

### 4.3 引入 20 行的空间查询原语并声明 bounds（解决 3.3)

在 `world/` 里加一个本地 primitive:

```ts
export function objectsAt(
  state: LocalWorldState,
  position: Position,
): ObjectId[] {
  // O(objects) 在当前房间几百对象的第一约束下足够；
  // 真要成为热点再按文档升级路径换 spatial index
}
```

- gate-yard 改成 `objectsAt(state, nextPos)` 判断阻挡对象，**删掉 `nextX === 2` 的 magic number**；
- RoomDefinition 增加可选 `bounds: { minX, maxX, minY, maxY }`,validateEntry/operation 都可以做范围校验，杜绝走出世界；
- 这一步应当发生在 Chapter 4 的复杂度爆发之前。

### 4.4 用 structural-sharing 替代全量克隆（解决 3.4)

Operation 的 commit 路径只需要复制**被修改的对象** entry，而不是整个 state:

```ts
const nextState: LocalWorldState = {
  ...state,
  objects: {
    ...state.objects,             // 浅 spread 复用未变对象引用
    ...changedObjects,            // 仅克隆被修改项
  },
  lastEvents: proposal.events ?? [],
};
```

- 前置条件是 `state.objects` 内部对象一旦被创建就不再原地改——这个不变量正是框架已有的；
- entry/metadata 同理：共享引用，不做无意识的 defensive clone;
- 把 `copyForResult / safeCopy` 的 `catch { return state; }` **删掉**，若 structuredClone 失败必须硬失败（返回操作失败 + 显式 reason)，不允许静默返回可变别名。

这是文档"对象级 selective copy → structural sharing"里的第 1–2 项，我建议把它前置为 Chapter 3 的实现方式而不是优化。

### 4.5 校验职责单一化（解决 3.5)

- `initializeLocalWorld` 是唯一的初始化入口，负责 validateEntry + 完整性校验；
- `transitionRoom` 只做路由与 catalog 查询，把 entry 原样透传；
- 相同 reason('invalid-entry')从两处报告改成一处；测试相应减去一次断言。

### 4.6 Scene 显式 ownership（解决 3.6)

- 删除 WeakMap 模块级注册表；
- `createWorldScene` 永远创建新实例，`getWorldScene` 删除；
- `pixi-host` 持有 `scene` 引用并在 `destroy()` 里负责销毁；渲染层（`renderChapter6`）从 host 参数收到 scene。

渲染所有权从"隐式全局"变成"host 拥有"——与 pixi-host 已有的生命周期管理一致。

### 4.7 按 objectId 保留 Graphics，不重造（解决 3.7)

虽然文档把 renderer reconciliation 推迟到"等待证据"，但**保留式渲染不是优化，是默认姿势**:

```ts
// 渲染层维护 Map<ObjectId, Graphics>，输入 view model
// diff view 与 map：add/update/remove 对象 tokens，不再 scene.clear()
```

配合 `world-view.ts` 输出的每个可视对象增加稳定 id，渲染从"每帧销毁/重建"变成"每帧差量更新"。这一步可以在 Chapter 12(presentation foundation）就定形，避免后续所有 chapter 都复制 current approach。

### 4.8 入口接线补一层 PlayerAction（解决 3.9)

- `main.ts` 定义 `PlayerAction = { kind: 'move-right' } | { kind: 'activate' }`;
- 一个小 dispatcher 把 DOM 事件映射到 PlayerAction，再由 chapter-specific reduce 到 `Chapter4Operation`;
- `worldState` 包在一个小的 `SessionController` 对象里，隐藏可变性；
- 处理 HMR:`import.meta.hot.dispose(() => host.destroy())`。

这层很薄，但它把"模板扩散路径"指向正确方向。

### 4.9 补两个轻量工程物（低成本高杠杆）

1. **`AGENTS.md`**（设计文档自己也提到了）：把依赖方向、禁止 import pixi.js 于 `src/world`、`chapters 不许引用未来 chapter`、验收命令写成 agent 可执行的 lint 约束；用 ESLint `import/no-restricted-paths` 或 dependency-cruiser 直接强制；
2. **README.md**:5 行讲清"这是什么、怎么跑、文档在哪"，docs/ 内的长文档链接进去。

### 4.10 测试侧的增量加强（保持轻量）

- 增加 **property-based test**（例如 fast-check）针对 `isObjectState` / `applyScopedOperation` 的不变量：任意变更必须遵守 scope-kind-identity 三条件全部成立。这类测试最能防止 LLM 在校验代码里"顺手简化";
- 增加 **architecture test**（一个 node 脚本 + 简单 AST 检查，或 dependency-cruiser）验证 `src/world/**` 不 import `pixi.js`，把文档的依赖方向变成 CI 约束。

---

## 5. 综合判断

这份代码库的现状是：**架构骨架十分正确、词汇学清晰、测试证明边界冻结有效；问题集中在三个扩展点（kind 校验、反馈通道、空间查询）上，它们今天不疼，但第二个 closure 落地时会变成固定的耦合**。

我的重写路径不会推翻任何骨架：保留 world/operation/closure/topology/checkpoint 的模块划分和原子提交语义，把重点放在：

1. 校验从"中央 switch"改成注册表（4.1);
2. 反馈从 string 改成 typed event(4.2);
3. 克隆从全量改成 structural sharing(4.4)。

这三件事在几百行以内的成本即可兑现，并且**每个改动都直接对应文档自己已经声明但被实现折损的约束**。之后才是 scene ownership、Graphcis pooling、AGENTS.md、README、architecture test 的顺序，按 Closure 的真实需求出现逐个落地。

最后，文档的第 13 节"明确等待证据的事项"本身是这个仓库最好的防熵增机制，重构建议部分的每一项也遵循同一个原则：**只在已出证的真实问题上动手**。

---

## 6. 修复记录（2026-08-28，drone 工作流）

上述第 3/4 节的问题已按下表落地修复，验收：`npm test`（15 files / 69 tests 全过，含新增架构测试）+ `npm run build`。

| 问题 | 修复 | 落点 |
| --- | --- | --- |
| 3.1 手工 switch 校验 | `Record<ObjectState['kind'], validator>` 映射表，新增 kind 漏写 validator 直接编译失败；`isObjectState` 查表，未注册 kind 拒绝 | `world/types.ts` |
| 3.2 string 嗅探反馈 | `lastOperation: string \| null` → `lastEvents: readonly OperationEvent[]`（tag 判别联合，含 `move-blocked.blockedBy`）；`OperationProposal.label` → `events`;view 层 switch on `tag` | `world/types.ts`、`world/operation.ts`、`chapter-4/world-view.ts`、`gate-yard.ts`、`npc-closure.ts` |
| 3.3 magic coordinates / 无边界 | 新增 `createSpatialIndex`（definition 位置索引）与 `movementIsLegal` + `RoomDefinition.bounds`;门/障碍阻挡改为"目标格上的阻挡对象"查询;激活改为"与机关同格"查询 | `world/spatial.ts`、`chapter-4`、`chapter-9` |
| 3.4 全量防御克隆 | 提交路径 structural sharing（只克隆被改对象）+ `deepFreeze` 提交态；拒绝路径直接返回输入态（已 frozen）;删除 `copyForResult / safeCopy` 的 `catch { return state; }` 可变别名回退；`createGameSession` 重建 frozen 不变量 | `world/operation.ts`、`world/checkpoint.ts`、`world/topology.ts`、`runtime/game-session.ts` |
| 3.5 双重 entry 校验 | `tryInitializeLocalWorld` 成为唯一校验点（返回 typed reason）,`transitionRoom` 只查 catalog 并透传 | `world/local-world.ts`、`world/transition.ts` |
| 3.6 隐藏 scene 注册表 | 删除 WeakMap 与 `getWorldScene`；`createWorldScene` 永远新建；host 创建并在 `destroy()` 中销毁 scene,handle 暴露 `scene` | `rendering/world-scene.ts`、`rendering/pixi-host.ts` |
| 3.7 每帧销毁重建 Graphics | `createChapter6Renderer`：持久 slot（Map<key, Graphics>），静态地面 tile 构造时绘制一次，每帧仅 `clear+repaint` 动态图形；阻挡装饰用 `visible` 切换 | `chapters/chapter-6/pixi-view.ts` |
| 3.9 main.ts 无 PlayerAction 层 | `PlayerAction` union + `toChapter4Operation` dispatcher + `SessionController`（唯一持有点）;`import.meta.hot.dispose` 销毁 host | `src/main.ts` |
| 3.8 barrel 反向导入 | chapter 改为定向 import；架构测试禁止 `import ... from '@/world'` | `chapter-4/9`、`src/architecture.test.ts` |
| 3.10 常量重复 | `rendering/layout.ts` 作为 CELL_SIZE / ORIGIN_X / WORLD_Y / VIEWPORT / BACKGROUND_COLOR 唯一来源，`cellToWorldX` 统一网格→像素映射；world-view 的显示坐标改由 definition 位置派生 | `rendering/layout.ts` 等 |
| 4.9 缺 AGENTS.md / README | 新增两文件；依赖方向、不变量、禁止项、验收命令全部成文 | `AGENTS.md`、`README.md` |
| 4.10 测试加强 | `src/architecture.test.ts`（6 条依赖方向规则）;`world/spatial.test.ts`;`chapter-2` 新增 validator 覆盖 + 确定性伪随机 fuzz（isObjectState 不抛错、不误收未知 kind);`chapter-3` 新增 frozen、structural sharing、拒绝态引用相等、events 提交 4 条不变量测试 | 对应文件 |

未做（有意保留）:不引入 zod / fast-check 等新依赖；不做 renderer diff-tree reconciliation（当前 persistent-slot 方案已消除销毁重建）;不引入全局事件总线。
