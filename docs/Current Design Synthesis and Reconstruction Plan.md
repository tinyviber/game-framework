---
title: Game Framework · Current Design Synthesis and Reconstruction Plan
status: current
updated: 2026-08-28
tags:
  - game-dev
  - architecture
  - world-design
  - local-world
  - closure
  - progression
  - typescript
  - pixijs
---

# Game Framework · Current Design Synthesis and Reconstruction Plan

这份文档记录目前对游戏框架的共同结论。它不是一个通用游戏引擎设计，也不是一个准备安装的 library 清单，而是当前项目自己的架构基线、游戏设计原则和重建路线。

## 1. 当前结论

项目已经从 probe 到 game 验证了一个可落地的方向，现在适合从终端 CLI 创建项目开始，重新实现一遍框架。

重新实现的目标不是机械复制旧代码，而是保留已经验证的边界，删除会把项目带回旧模型的概念。

当前主线是：

```text
Chapter 1 · Project Initialization
        ↓
Chapter 2 · World Model + Local World
        ↓
Chapter 3 · Scoped Operation + Atomic Commit
        ↓
Chapter 4 · Level-specific Closure
        ↓
Chapter 5 · Room Transition + Persistent Metadata
        ↓
Chapter 6 · Pixi Presentation
```

在这条主线之上，重建计划已延伸到 Chapter 12（Closure Contract、
Reachability/Topology、NPC closure-local interaction、Checkpoint、
Runtime integration、3/4 presentation foundation），完整章节表与
各章健壮性要求见第 8 节和第 10 节。

旧的 Tick、History、RunDefinition、StepSession 和旧的 Level 01/Chapter 7–9 路线已经是 archived research，不再是正式世界的运行时。

产品优先级保持为：

```text
Puzzle first
Programming second
Education third
```

编程和教育必须增强 puzzle 的可观察性与表达力，而不能让框架复杂度取代 puzzle 本身。

## 2. 产品约束

当前项目明确使用：

- TypeScript；
- Vite；
- PixiJS 8；
- DOM/CSS 作为 programming workbench UI；
- 由显式状态变化保持可复现的世界行为；
- `RunDefinition` 不再作为正式 world 的核心模型；
- Pixi 只负责 presentation，不负责 gameplay truth；
- level-specific 的 gameplay semantics；
- 当前只维护主角所在的 Local World。

当前明确不引入：

- ECS，除非真实 profiling 和对象关系证明它是必要的；
- Phaser；
- Universal Game Engine；
- Universal Directive AST；
- Universal Node Programming Framework；
- React 作为运行时前提；
- Pixi ticker 作为 gameplay 时钟；
- 全局事件总线来承载所有对象行为；
- 为了“未来可能需要”而提前建立的大型行为注册表。

基本规则：如果一个 20–100 行的内部 primitive 能解决问题，就不要引入一个拥有自己生命周期、配置系统和抽象层的大框架。

## 3. 世界模型：连续感来自状态所有权，而不是全局模拟

### 3.1 Immutable Objects

Immutable object definitions 描述不会因为一次玩家操作而改变的世界事实，例如：

- 地形；
- 建筑物；
- 房间的静态出口；
- 机关、门、障碍物的初始定义；
- 对象的 id、kind、位置和 tags。

这些定义可以被共享、缓存和重复使用，但运行时不能直接改写它们。

### 3.2 Mutable Objects

Mutable object states 描述当前 Local World 中可以发生变化的对象，例如：

- 主角 `main character`；
- NPC；
- 机关；
- 门；
- 可清除的障碍物；
- 未来可能出现的局部 puzzle objects。

对象是否 mutable 是领域语义，不是渲染层的决定。Pixi display object 不能成为对象状态的来源。

### 3.3 World 的组成

玩家感知的世界可以看作：

```text
World
├── immutable room/object definitions
├── current LocalWorldState
├── persistent metadata
├── room topology / transition definitions
└── presentation projection
```

但计算机不需要同时维护所有房间的 mutable 运行态。当前最小运行时只维护：

```text
Current Local World
= current room definition
+ current room mutable object states
+ entry parameters
+ read-only persistent metadata
```

当主角进入另一个房间时：

1. 当前 local state 停止作为 active state；
2. 根据目标 `RoomDefinition`、entry parameters 和 persistent metadata 初始化新 Local World；
3. 新房间成为唯一 active local state；
4. 不默认在后台运行其他房间的 NPC、机关或动画。

因此技术上可以切换 room，认知上仍然是同一个连续世界。

### 3.4 性能边界

当前实现以“当前房间几百个对象以内”为第一性能边界：

- 初始化只复制当前房间需要的数据；
- Operation 只复制当前 Local World 的 draft；
- 不维护全局 room state cache；
- 不做所有房间的后台 pathfinding 或 NPC simulation；
- 不为了理论上的开放世界规模提前引入 ECS、worker 或数据库。

如果 profiling 证明复制成本成为瓶颈，再按证据逐步引入：

1. 对象级 selective copy；
2. structural sharing；
3. closure checkpoint；
4. room-level serialization；
5. worker 或更细粒度空间分区。

这些都是优化选项，不是初始架构的前提。

## 4. Operation、Event、Function、Transform 的词汇边界

“Interaction”可以描述玩家行为，但它同时可能混合输入、规则、结果和反馈。当前建议使用以下分层词汇：

| 概念 | 含义 | 是否改变正式 state |
| --- | --- | --- |
| `PlayerAction` | 玩家或 workbench 产生的意图，例如 move、activate | 否，先是输入 |
| `WorldOperation` | 针对当前 Closure 的语义状态变化请求 | 通过校验后是 |
| `StateTransform` | 实现规则的纯函数或局部规则函数 | 返回新 state/proposal |
| `ObjectChange` | 某个 objectId 的新状态 | 是 proposal 的组成部分 |
| `Event` | 已发生事实、反馈、日志或分析信息 | 不应自动成为权限入口 |
| `RoomTransition` | 更换 active Local World 的边界操作 | 是，重建 active state |

推荐的运行链路：

```text
input / PlayerAction
        ↓
level-specific WorldOperation
        ↓
Closure scope + object/state validation
        ↓
atomic LocalWorldState replacement
        ↓
view projection + feedback/event record
```

这里的 `Event` 更适合表示“发生了什么”和“应该展示什么”，而不是做一个允许任何模块订阅和修改世界的 Universal Event Bus。

## 5. Closure：局部自由，宏观严控

一个 Closure 不是简单的地图区域，也不是一个 boolean flag。它应该具有可测试的 contract：

```text
Entry Preconditions
        ↓
Internal Freedom
        ↓
Exit Predicate
        ↓
Persistent Effect
```

### 5.1 Entry Preconditions

明确玩家进入 closure 时需要满足的条件，例如：

- 从哪个入口进入；
- 主角的初始位置；
- 当前 persistent metadata；
- 哪些对象存在；
- 哪些能力已经可用。

### 5.2 Internal Freedom

进入 closure 后允许玩家探索、尝试、失败和重置。Closure 内部可以有多种合法探索顺序，也可以有多解，但这些自由必须在 closure 的对象和规则边界内。

### 5.3 Exit Predicate

出口不应该只检查：

```ts
hasBranchAbility === true
```

而应该检查玩家是否真正用能力解决了环境变化问题：

```text
Prove, Don't Check
```

例如 branch 能力必须实际改变一个分支环境，才能满足 exit predicate。

### 5.4 Persistent Effect

离开 closure 时只提交明确的永久变化，例如：

- `locked → unlocked`；
- `closed → open`；
- `offline → powered`；
- `blocked → cleared`。

宏观 progression 尽量单调，减少 `A/B/C` 状态反复组合带来的世界状态爆炸。

### 5.5 Hard Gate 不能 Softlock

Closure 可以严格封锁宏观出口，但 closure 内任何合法状态都必须满足至少一个条件：

- 仍然有解；
- 可以回到入口；
- 可以局部 reset；
- 可以回到 checkpoint；
- 失败只丢失局部尝试，不破坏不可恢复的世界状态。

“Open Inside, Sealed Outside”是边界原则，不是让玩家被困住的借口。

## 6. Progression 与世界设计

### 6.1 Final State

Final State 不只是 ability list。它至少要定义：

- 玩家最终拥有的能力；
- 世界的永久状态；
- 最终可达区域；
- 程序表达能力；
- 玩家最终应该理解的世界规则。

玩家最终获得的是一套“世界操作语言”，而不是一串孤立的钥匙。

### 6.2 Capability Graph ≠ Spatial Graph

能力依赖图和世界空间图必须分开：

```text
Capability Graph  → 能力依赖，通常可以接近 DAG
Spatial Graph     → 房间拓扑，可以有环、Hub、回溯和 shortcut
```

能力图决定“现在能做什么”，空间图决定“现在能去哪”。不要用一个 level sequence 同时表达两者。

### 6.3 Promise before Solution

先让玩家看到未来的可能性，再给出能力或规则：

```text
See a Possibility
        ↓
Try and Fail
        ↓
Explore Current Closure
        ↓
Discover Rule / Solve Puzzle
        ↓
Gain or Understand Capability
        ↓
Reinterpret Old World
        ↓
Break a Hard Gate
        ↓
Permanent World Change
        ↓
Enter a Larger Closure
```

### 6.4 Recontextualization

每个重要 ability 至少应该有：

- 立即用途；
- 旧世界用途 × N；
- 一个可选 secret 或 alternate route；
- 一个后期组合用途。

如果能力只打开眼前一扇门，它更像换皮钥匙，而不是世界语言的一部分。

### 6.5 拓扑压缩

Progression 同时应该提高可达空间、降低旅行摩擦：

```text
reachable space ↑
travel friction ↓
```

shortcut、永久开门、Hub 和传送点不是便利性附属品，而是 progression 的可感知反馈。

## 7. 当前代码架构

当前 active source 的依赖方向：

```text
src/world/types.ts
        ├── src/world/local-world.ts
        ├── src/world/operation.ts
        ├── src/world/closure.ts
        └── src/world/transition.ts
                ↓
src/chapters/chapter-4/*
        ↓
src/chapters/chapter-6/*
        ↓
src/main.ts + src/rendering/*
```

约束：

- `src/world` 不依赖任何 chapter；
- world primitives 内部直接导入 types，不反向依赖 barrel；
- chapter 负责 level-specific semantics；
- presentation 只消费 view model；
- `main.ts` 负责把 DOM input、world operation、view projection 和 Pixi host 接起来；
- renderer 不保存第二份 gameplay state。

### 当前文件映射

| 文件 | 职责 |
| --- | --- |
| `src/world/types.ts` | ObjectId、RoomId、ClosureId、immutable definitions、ObjectState 与 per-kind validator 注册表、OperationEvent 联合类型、数据复制与验证 |
| `src/world/spatial.ts` | 基于 definition 位置的 `createSpatialIndex` 与 `movementIsLegal` bounds 校验 |
| `src/world/local-world.ts` | 从 definition 初始化当前 Local World；`tryInitializeLocalWorld` 是唯一入口校验点，`initializeLocalWorld` 为抛错包装 |
| `src/world/closure.ts` | Closure entry/exit contract 与 persistent effect 结果 |
| `src/world/topology.ts` | 显式 RoomRoute、reachable projection 与 topology-aware transition |
| `src/world/checkpoint.ts` | active Local World checkpoint、local restore 与 metadata 保留 |
| `src/runtime/game-session.ts` | session owner、effect commit、topology transition 与 checkpoint orchestration |
| `src/world/operation.ts` | Closure scope、proposal 校验、structural-sharing 原子提交（仅克隆被改对象，提交态 deepFreeze）、typed `OperationEvent` 反馈 |
| `src/world/transition.ts` | RoomCatalog、entry 校验、A→B→A 重建 |
| `src/chapters/chapter-4/gate-yard.ts` | 主角、机关、门、障碍物和出口的具体规则 |
| `src/chapters/chapter-9/npc-closure.ts` | closure-owned NPC 与局部交互规则 |
| `src/chapters/chapter-6/pixi-view.ts` | view model → Pixi display objects |
| `src/rendering/world-scene.ts` | WorldRoot、render layers 与 camera transform（无全局注册表，生命周期由 host 拥有） |
| `src/rendering/layout.ts` | CELL_SIZE / ORIGIN_X / WORLD_Y / VIEWPORT 等布局常量的唯一来源 |
| `src/rendering/pixi-host.ts` | Pixi Application 生命周期、WorldScene 创建与销毁、WorldRoot/UIRoot 挂载 |
| `src/main.ts` | 浏览器入口：PlayerAction → chapter operation 的 dispatcher 与 SessionController |
| `src/architecture.test.ts` | 机器强制的依赖方向检查（world 无 Pixi、chapter 不用 barrel、无未来章节引用等） |

## 8. Chapter 重建计划

每章必须是一个可以告一段落的最小可执行版本。测试文件只能依赖本章和已经完成的前置章节，不能引用未来章节的代码。

| Chapter | 最小主题 | 核心文件 | 最小验证 |
| --- | --- | --- | --- |
| 1 | 项目初始化 | `bootstrap.ts` | `npm test -- src/bootstrap.test.ts` |
| 2 | World Model + Local World | `world/types.ts`、`world/local-world.ts` | `npm test -- src/chapters/chapter-2/world.test.ts` |
| 3 | Scoped Operation + atomic commit | `world/operation.ts` | `npm test -- src/chapters/chapter-3/operation.test.ts` |
| 4 | 第一个 level-specific Closure | `chapters/chapter-4/gate-yard.ts` | `npm test -- src/chapters/chapter-4/gate-yard.test.ts` |
| 5 | Room Transition + persistent metadata | `world/transition.ts` | `npm test -- src/chapters/chapter-5/transition.test.ts` |
| 6 | Pixi presentation | `chapters/chapter-6/pixi-view.ts` | `npm test -- src/chapters/chapter-6/pixi-view.test.ts` + build |
| 7 | Closure Contract | `world/closure.ts`、Chapter 4 contract | `npm test -- src/chapters/chapter-7/closure-contract.test.ts` |
| 8 | Reachability + topology | `world/topology.ts`、explicit shortcut route | `npm test -- src/chapters/chapter-8/topology.test.ts` |
| 9 | NPC closure-local interaction | `chapters/chapter-9/npc-closure.ts` | `npm test -- src/chapters/chapter-9/npc-closure.test.ts` |
| 10 | Checkpoint + recovery | `world/checkpoint.ts` | `npm test -- src/chapters/chapter-10/checkpoint.test.ts` |
| 11 | Runtime integration | `runtime/game-session.ts` | `npm test -- src/runtime/game-session.test.ts` |
| 12 | 3/4 presentation foundation | `rendering/world-scene.ts`、Pixi view layers | `npm test -- src/rendering/world-scene.test.ts` + build |

当前 Chapter 9–11 的 pure state contracts 与 Chapter 12 的 presentation foundation 已完成；后续 browser integration 不得污染 Chapter 2–12 的最小闭环。

## 9. 每章的实现协议

从终端重新实现一个章节时，遵循以下固定流程：

1. 用 CLI 创建或确认项目骨架；
2. 只实现当前章节定义的最小 production files；
3. 同时创建本章节的 `*.test.ts`；
4. 测试只使用当前章节和前置章节的 API；
5. 执行本章节命令，确认可以独立告一段落；
6. 需要浏览器时，再执行 `npm run dev` 做人工验收；
7. 记录“不做什么”，避免下一次 LLM 自动扩大范围；
8. 只有当前章节测试和构建通过，才进入下一章。

推荐每章文档固定包含：

- 本章目标；
- 文件边界；
- 数据流；
- 关键不变量；
- 最小命令；
- 测试覆盖；
- 明确不做的内容；
- 下一章唯一入口。

## 10. 测试与 Robustness 要求

### Chapter 2

- definition snapshot 深层隔离；
- entry 和 persistent metadata 深层复制；
- 初始化对象的 kind 与 identity 校验；
- mutable state 不反向污染 definitions。

### Chapter 3

- 成功 Operation 不修改原始 state；
- 一个非法 change 导致整个 proposal 拒绝；
- Operation 抛异常时无部分提交；
- scope 不能被 Operation 扩大；
- unknown object、kind mismatch 和 invalid state 都有明确 rejection。

### Chapter 4

- 关闭的门可以阻挡主角；
- 机关必须在正确位置被激活；
- 门和障碍物的变化原子发生；
- view model 能表达 running、blocked、complete；
- 规则不依赖 Pixi。

### Chapter 5

- unknown room 不改变当前世界；
- invalid entry 不改变当前世界；
- A→B→A 使用新的 entry parameters 重建；
- persistent metadata 只作为初始化输入传递；
- 失败不会产生半初始化状态。

### Chapter 6

- renderer 只消费 view model；
- renderer 可以替换旧 frame；
- host 管理 init/mount/destroy；
- gameplay state 不从 ticker、Graphics 或 Container 反推。

### Chapter 7

- entry 校验对齐 closure identity 和 precondition；
- exit predicate 成功之前不产生 persistent effect；
- 契约回调抛异常时报告为 rejected result，无部分提交；
- 契约回调与当前 active local state 隔离；
- 宏观进度要求已解决的环境本身，而不是仅凭一个 persistent flag。

### Chapter 8

- topology 定义快照化并冻结，可达性只投影已声明房间；
- 显式 shortcut route 被保留，不推断反向路由；
- 路由循环不推断 unknown rooms；
- route predicate 不修改 persistent metadata；
- 拒绝 blocked route 时不改变当前世界，invalid route entry 仍由
  Chapter 5 的 transition validator 拒绝。

### Chapter 9

- NPC 在玩家进入交互范围之前保持不变；
- 交互只改变 active closure 内的目标 NPC；
- 不存在全局 NPC 模拟，也不修改其它 local world 的 NPC；
- 来自其它 active closure 的操作被拒绝；
- 错误的 NPC target 被拒绝且不改变 NPC 状态；
- 移动不得越出房间边界。

### Chapter 10

- checkpoint 只快照 local state，与 persistent progress 隔离；
- 恢复 local attempts 时保留当前 persistent metadata；
- 来自其它 active room 或 closure 的 checkpoint 被拒绝；
- local object set 不一致的 checkpoint 被拒绝；
- malformed checkpoint 被拒绝且无部分恢复。

### Chapter 11

- closure effect 提交先于真实 room transition 生效；
- chapter-specific operation 通过 active local world 路由；
- operation adapter 相互隔离，adapter 失败有明确报告；
- 恢复 local checkpoint 不回滚 permanent progress；
- permanent progress 变化后旧 local checkpoint 失效；
- 切换房间后清除 local checkpoint。

### Chapter 12

- 为 3/4 视角呈现创建稳定的 world layers；
- 每个 root 创建独立 scene，没有全局 scene registry；
- camera transform 不改变 world model。

## 11. 游戏性、可玩性与工程性的统一判断

### 游戏性

框架最重要的价值是让玩家看见“我改变了什么”：

- 被阻挡时要能看见阻挡原因；
- Operation 后相关对象要同时反馈；
- 永久变化要能在旧区域被重新识别；
- 失败要提供下一次尝试的信息，而不是只显示 error；
- 世界、程序和反馈必须指向同一个 state transition。

### 可玩性

- Closure 内允许尝试和探索；
- Closure 外保持 progression 收敛；
- 不把能力 flag 当作唯一解锁证明；
- 所有 hard gate 都需要恢复路径；
- 能力必须产生旧世界 recontextualization；
- 世界扩张的同时减少 travel friction。

### Scalable Code

- shared primitives 保持小而稳定；
- 规则留在具体 chapter，而不是抽象成万能行为系统；
- `ObjectState` 必须是可序列化、可验证的明确联合类型；
- module dependency 单向；
- view model 隔离世界状态和渲染实现；
- 每章用测试冻结边界，再扩展功能。

### Robustness

- immutable definition 与 mutable runtime state 分离；
- Operation all-or-nothing；
- room transition 失败可拒绝且保留当前 state；
- host 生命周期明确销毁；
- persistence 只通过显式 metadata 边界发生；
- 错误必须落在可观察的 rejection/result，而不是静默改变世界。

### AI Coding Maintainability

由于项目从 probe 到 game 主要由 LLM 生成，架构约束必须可执行：

- 当前 MOC 是唯一主线入口；
- 每章文档明确“不做什么”；
- 每个 primitive 附近有对应测试；
- future chapter 不得被当前 chapter 导入；
- 命名使用 `chapter`，不再重新引入 `levels` 作为框架层级；
- archived 文档明确不可作为当前 API；
- 任何跨模块修改都要运行全量 test/build；
- `AGENTS.md` 已经把 dependency direction、test command 和“不引入 ECS/全局 Tick”的约束写成 agent 可执行规则，并由 `src/architecture.test.ts` 在测试中强制执行。

## 12. 研究中值得借鉴的实现 pattern

外部项目研究的价值主要在小型实现模式，而不是引入大依赖。当前值得保留的 pattern 是：

- pure state transition：规则函数输入明确、输出明确、易测试；
- command/proposal + validation：先提出 changes，再由 runtime 原子校验和提交；
- view projection：world state → view model → renderer；
- lifecycle-owned host：Application 的 init/destroy 由 host 管理；
- keyed or scoped state ownership：对象状态属于明确的 local world/closure；
- replay/debugging as a tool：回放可以是调试工具，但不应反过来成为正式世界模型；
- executable architecture docs：文档中的依赖边界必须能由测试、构建或静态检查验证；
- small tests near the pattern：一个 primitive 一个最小行为测试，比大而全的 integration test 更容易帮助 LLM 保持边界。

这些 pattern 应该提取成内部代码，不应该因为某个仓库使用它们，就直接引入完整框架。

## 13. 明确等待证据的事项

以下事项暂时不要实现：

- 全局所有房间的 mutable state；
- 后台 NPC 自主世界模拟；
- 通用 pathfinding；
- ECS；
- Universal Event Bus；
- Universal Directive AST；
- 通用 node programming runtime；
- renderer reconciliation 优化；
- worker 化 simulation；
- save-room cache；
- 全局 fixed timestep loop；
- 为了测试 Pixi 而引入重量级 pixel-diff 基础设施。

只有 profiling、真实 closure 需求、测试失败或玩家体验验证证明某一项必要，才进入对应章节。

## 14. 当前验收命令

完整项目验收：

```sh
npm test && npm run build
```

单章验收示例：

```sh
npm test -- src/chapters/chapter-2/world.test.ts
npm test -- src/chapters/chapter-3/operation.test.ts
npm test -- src/chapters/chapter-4/gate-yard.test.ts
npm test -- src/chapters/chapter-5/transition.test.ts
npm test -- src/chapters/chapter-6/pixi-view.test.ts
npm test -- src/chapters/chapter-7/closure-contract.test.ts
npm test -- src/chapters/chapter-8/topology.test.ts
npm test -- src/chapters/chapter-9/npc-closure.test.ts
npm test -- src/chapters/chapter-10/checkpoint.test.ts
npm test -- src/runtime/game-session.test.ts
npm test -- src/rendering/world-scene.test.ts
```

## 15. 最终执行顺序

如果从零重新实现当前项目，顺序固定为：

```text
CLI project initialization
→ Chapter 1 bootstrap + test
→ Chapter 2 definitions + local state + test
→ Chapter 3 scoped operation + atomic test
→ Chapter 4 first closure + gameplay test
→ Chapter 5 room transition + persistence test
→ Chapter 6 DOM/Pixi presentation + renderer test
→ Chapter 7 closure contract
→ Chapter 8 reachability/topology
→ Chapter 9 NPC-local interaction
→ Chapter 10 checkpoint/recovery
→ Chapter 11 runtime integration
→ Chapter 12 3/4 presentation foundation
```

每一步都必须有一个明确的“现在可以运行什么”。如果某一步不能通过一个终端命令和一个独立测试结束，就说明这一章仍然过大，需要继续拆分。
