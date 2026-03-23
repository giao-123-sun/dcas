# DCAS: Decision-Centric Agent System

> 把"一个聪明人做决策时脑子里转的东西"拆成六个独立模块，让每个模块可以单独进化、可替换、可追溯。

**版本**: 0.1.0 (核心引擎)
**状态**: 六层核心完成，Demo 待开发
**组织**: Agioa Internal

---

## 目录

- [1. 项目目的](#1-项目目的)
- [2. 架构总览](#2-架构总览)
- [3. 项目结构](#3-项目结构)
- [4. 各层详细说明](#4-各层详细说明)
- [5. 开发思路与设计决策](#5-开发思路与设计决策)
- [6. 测试覆盖](#6-测试覆盖)
- [7. 开发进展](#7-开发进展)
- [8. 未开发功能](#8-未开发功能)
- [9. 已知问题与技术债务](#9-已知问题与技术债务)
- [10. 快速开始](#10-快速开始)

---

## 1. 项目目的

### 问题

2026年市面上大量"Agent赚钱"案例（自媒体涨粉、量化交易、跑单Agent、代码赏金等），它们都或多或少包含目标驱动、预测、策略选择、执行反馈等要素，但存在四个共性问题：

1. **耦合** — 目标、预测、策略、执行全部混在一起，改一个地方全部要改
2. **不可迁移** — 涨粉Agent的架构完全不能复用到量化Agent上
3. **不可组合** — 不能把某个Agent的"预测模块"拿出来给另一个系统用
4. **不可观测** — 无法回溯"为什么系统做了这个决策"

### 解决方案

DCAS 将所有"目标驱动型Agent"的决策过程解耦为 **六个独立层**，每层有清晰的输入输出接口，可以独立演进、替换、组合。

类比：量化交易从"一个人盯盘手动买卖"演进到"Alpha模型 + 风控 + 执行引擎 + 回测"的分层架构。DCAS 是对 **一切决策场景** 的通用分层。

### 与 MetaClaw 的关系

DCAS 提供 **决策大脑**（L1-L4），MetaClaw 提供 **执行肌肉**（通过SkillRL自进化的Agent执行层）。两者通过 Strategy-to-Skill 翻译层对接，各自独立演进。

---

## 2. 架构总览

```
┌─────────────────────────────────────────────────────────┐
│                  DCAS Runtime (Brain)                     │
│                                                          │
│  ┌──────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │  L1       │   │  L2           │   │  L3           │    │
│  │  World    │──▶│  Objective    │──▶│  Prediction   │    │
│  │  Model    │   │  Function     │   │  Engine       │    │
│  └──────────┘   └──────────────┘   └──────┬───────┘     │
│       │                                     │             │
│       │              ┌──────────────────────┘             │
│       │              ▼                                    │
│       │         ┌──────────────┐                          │
│       ├────────▶│  L4           │                         │
│       │ (fork)  │  Simulation & │                         │
│       │         │  Strategy     │                         │
│       │         └──────┬───────┘                          │
│       │                │                                  │
│       │          策略输出 (Strategy)                       │
│       │                │                                  │
│  ┌────┴─────┐   ┌─────┴────────┐   ┌──────────────┐     │
│  │  L5       │◀──│  L6           │   │  MetaClaw    │     │
│  │  Memory & │   │  Decision     │──▶│  Integration │     │
│  │  Learning │   │  Loop         │   │  Layer       │     │
│  └──────────┘   └──────────────┘   └──────────────┘     │
└─────────────────────────────────────────────────────────┘
```

| Layer | 名称 | 一句话 | 输入 | 输出 |
|-------|------|-------|------|------|
| L1 | World Model | 世界是什么样的 | 外部数据 | 实体-关系图谱 + 实时状态 |
| L2 | Objective Function | 我们要什么 | KPI定义 + 约束 | 多目标优化评分 |
| L3 | Prediction Engine | 会发生什么 | 世界状态 + 假设动作 | 概率分布（不是点估计） |
| L4 | Simulation & Strategy | 应该怎么做 | 候选策略 × 世界分叉 | 各策略KPI排序 + 推理链 |
| L5 | Memory & Learning | 学到了什么 | 决策过程 + 实际结果 | 模式库 + 校准信号 |
| L6 | Decision Loop | 何时行动 | KPI监控信号 | 触发决策 / 自动执行 |

---

## 3. 项目结构

```
dcas/
├── packages/
│   └── core/                          # @dcas/core — 核心引擎
│       ├── src/
│       │   ├── world-model/           # L1: 世界模型
│       │   │   ├── types.ts           #   核心类型定义（Entity, Relation, CascadeRule 等）
│       │   │   ├── entity.ts          #   实体工厂（create, clone, setProperty）
│       │   │   ├── relation.ts        #   关系工厂（create, clone）
│       │   │   ├── graph.ts           #   WorldGraph 类 ★ 核心数据结构
│       │   │   ├── cascade.ts         #   级联传播引擎
│       │   │   └── fork.ts            #   世界分叉（deep copy）
│       │   │
│       │   ├── objective/             # L2: 目标函数
│       │   │   ├── types.ts           #   KPI, Constraint, Tradeoff 类型
│       │   │   └── objective.ts       #   evaluateObjective(), compareWorlds()
│       │   │
│       │   ├── prediction/            # L3: 预测引擎
│       │   │   ├── types.ts           #   ProbabilityDistribution, PredictionModel 接口
│       │   │   ├── distribution.ts    #   normal/skewed/point/ensemble 分布工具
│       │   │   ├── engine.ts          #   PredictionEngine（注册、ensemble、recalibrate）
│       │   │   └── models/
│       │   │       ├── heuristic.ts   #   规则匹配预测（领域专家知识）
│       │   │       ├── statistical.ts #   线性回归预测
│       │   │       ├── gradient-boost.ts # 树模型集成预测（RandomForest）
│       │   │       └── llm.ts         #   LLM预测（Gemini via OpenRouter）
│       │   │
│       │   ├── simulation/            # L4: 模拟与策略
│       │   │   ├── types.ts           #   Strategy, SimulationResult, RankedStrategies
│       │   │   ├── simulator.ts       #   simulateStrategy() — fork→act→cascade→evaluate
│       │   │   ├── comparator.ts      #   compareStrategies() — 多策略排序
│       │   │   └── llm-generator.ts   #   LLM策略生成（Gemini生成候选策略）
│       │   │
│       │   ├── memory/                # L5: 记忆与学习
│       │   │   ├── types.ts           #   DecisionRecord, Pattern, LearningUpdate
│       │   │   ├── decision-store.ts  #   决策历史存储 + 查询
│       │   │   ├── pattern.ts         #   模式记忆（提取、强化、查询）
│       │   │   └── learning.ts        #   学习闭环（偏差分析、模式发现）
│       │   │
│       │   ├── loop/                  # L6: 决策循环
│       │   │   └── controller.ts      #   DecisionLoopController（三模式控制器）
│       │   │
│       │   ├── llm/                   # LLM 集成
│       │   │   ├── client.ts          #   OpenRouter API 客户端
│       │   │   └── world-serializer.ts#   WorldGraph → LLM可读文本
│       │   │
│       │   ├── metaclaw/              # MetaClaw 集成
│       │   │   ├── types.ts           #   MetaClawSkill, Feedback 类型
│       │   │   ├── translator.ts      #   Strategy → Skill 翻译器
│       │   │   ├── skill-manager.ts   #   技能文件管理 + 版本控制
│       │   │   └── feedback.ts        #   反馈处理 → 学习信号提取
│       │   │
│       │   ├── utils/
│       │   │   └── id.ts              #   UUID 生成
│       │   │
│       │   └── index.ts               #   Barrel export（公共API）
│       │
│       ├── tests/                     # 测试（镜像 src 结构）
│       │   ├── world-model/           #   graph.test.ts, cascade.test.ts, fork.test.ts
│       │   ├── objective/             #   objective.test.ts
│       │   ├── prediction/            #   prediction.test.ts, gradient-boost.test.ts
│       │   ├── simulation/            #   simulation.test.ts
│       │   ├── memory/                #   memory.test.ts
│       │   ├── loop/                  #   controller.test.ts
│       │   └── metaclaw/              #   metaclaw.test.ts
│       │
│       ├── package.json               #   @dcas/core 包配置
│       ├── tsconfig.json
│       ├── tsup.config.ts             #   构建配置（ESM + CJS + d.ts）
│       └── vitest.config.ts           #   测试配置
│
├── docs/
│   └── diagrams/                      # Gemini生成的架构图
│       ├── 01_dcas_overview_*.jpg     #   六层架构总览
│       ├── 02_world_model_detail.png  #   World Model + Fork + Cascade 详解
│       ├── 03_decision_flow*.jpg      #   决策闭环流程
│       └── 04_day1_summary.png        #   Day 1 总结信息图
│
├── scripts/
│   └── gen-diagrams.mjs               #   Gemini图片生成脚本
│
├── package.json                       #   根 workspace 配置
├── pnpm-workspace.yaml                #   pnpm monorepo 配置
├── tsconfig.base.json                 #   共享 TypeScript 配置
└── .gitignore
```

**文件统计**: 38 个源文件, 10 个测试文件, 4 张架构图

---

## 4. 各层详细说明

### L1: World Model (`world-model/`)

**核心概念**: Typed Property Graph — 实体 + 关系 + 属性，构成世界的结构化表示。

**关键类**:
- `WorldGraph` — 核心数据结构。内部用 5 个 Map/Set 维护实体、关系、邻接索引、类型索引。
- `forkGraph()` — 将世界复制为独立分支（deep copy），修改分支不影响原始。这是 L4 模拟的基础。
- `applyCascade()` — 属性变更沿关系链自动传播。用 `visited: Set<entityId:property>` 防环，`maxDepth` 限深。

**类型系统**:
- Branded types (`EntityId`, `RelationId`, `SnapshotId`) — 编译期防止 ID 类型混淆
- `CascadeRule` — 声明式传播规则，由领域包注册，core 保持领域无关
- `ChangeResult` — 每次 mutation 统一返回 diffs，为 L5/L6 提供变更追踪

**设计决策**:
- MVP 阶段用 full deep copy 而非 copy-on-write（demo 规模足够快，简化调试）
- `PropertyValue` 是递归 JSON union 类型，不引入 schema 库
- 邻接用双向索引（outgoing + incoming），支持高效的双向遍历

### L2: Objective Function (`objective/`)

**核心概念**: 将"什么是好的"变成可计算的公式。

**功能**:
- `evaluateObjective()` — 计算 KPI 归一化分数，加权求和得出综合分
- `compareWorlds()` — 对比两个 fork 世界的目标函数得分
- 硬约束违反 → 得分直接归零（一票否决）
- 软约束违反 → 记录但不归零
- Tradeoff — 动态调整 KPI 权重偏好（学习决策者风格）

**归一化规则**:
- maximize: `score = min(value / target, 1)`
- minimize: `score = max(1 - value / target, 0)`
- 无 target 时用 sigmoid-like: `value / (1 + |value|)`

### L3: Prediction Engine (`prediction/`)

**核心概念**: 所有预测输出概率分布，不是点估计。

**四种预测模型**:

| 模型 | 类 | 适用场景 | 数据需求 |
|------|-----|---------|---------|
| 规则 | `HeuristicModel` | 领域专家经验可编码 | 无 |
| 统计 | `StatisticalModel` | 线性关系、特征已知 | 手动标定系数 |
| 树模型 | `GradientBoostModel` | 非线性、特征交互 | ≥5 样本训练 |
| LLM | `LLMPredictionModel` | 复杂推理、数据不足 | API调用 |

**Ensemble 机制**:
- 所有预测同一属性的模型自动按置信度加权合并
- 模型间分歧越大 → 合并后置信度越低（自动表达不确定性）
- `recalibrate()` 根据实际偏差调整模型准确度

**GradientBoostModel 细节**:
- 底层: `ml-random-forest` (RandomForestRegression)
- 不确定性估计: 从单棵树预测的分歧度计算 std
- Feature importance: 基于 permutation importance
- 需要至少 5 个训练样本

### L4: Simulation & Strategy (`simulation/`)

**核心概念**: Fork 世界 → 执行策略 → 评估目标 → 对比排序。

**`simulateStrategy()` 流程**:
1. `forkGraph(world)` 创建独立分支
2. 按步骤执行 `strategy.actions`（每步设置一个属性）
3. 每步后检查 `conditionals`（如果……就……）
4. 每步可选运行 `PredictionEngine`
5. 级联传播自动触发
6. 最终用 `evaluateObjective()` 打分
7. 输出推理链（每步发生了什么，可追溯）

**`compareStrategies()`**: 对 N 个策略并行模拟，按得分降序排列。硬约束违反者强制排最后。

**LLM 策略生成** (`llm-generator.ts`):
- 将 WorldGraph + ObjectiveSpec 序列化为文本
- Gemini 基于上下文生成 N 个候选策略（含具体 actions）
- 输出转换为标准 `Strategy` 对象，可直接进入模拟流程

### L5: Memory & Learning (`memory/`)

**核心概念**: 记住每次决策，从"预测 vs 实际"的偏差中学习。

**DecisionStore**:
- 记录完整决策生命周期: 当时的世界快照、候选策略、选择、理由
- `outcome` 字段事后填入: 实际 KPI 值 + 偏差 + 意外效应
- 支持按时间、策略类型、是否有结果查询

**PatternMemory**:
- 从决策历史中提取模式: "策略X在Y类场景下表现好/差"
- 重复出现的模式自动强化（supportCount++, confidence++）
- 去重: 相同条件+相同观察 → 合并为一条

**Learning Loop** (`learnFromOutcome()`):
- 偏差 < 5% → `confidence_up`（模型准，加分）
- 偏差 > 15% → `recalibrate`（模型偏了，需校准）
- 意外效应 → `ontology_suggestion`（世界模型可能缺了什么）
- `analyzeDecisionHistory()` — 批量分析多条记录，检测系统性偏差

### L6: Decision Loop Controller (`loop/`)

**三种模式**:
- `reactive` — 仅手动触发时运行
- `monitoring` — 定期检查 KPI，有告警时触发决策流程
- `autonomous` — monitoring + 当最优策略置信度够高时自动执行

**`runCycle()` 流程**:
1. `checkKPIs()` — 检测阈值突破，返回告警列表
2. 调用 `strategyGenerator()` 获取候选策略
3. `compareStrategies()` 模拟排序
4. 判断: 自动执行 or 推荐给人类
5. 如果有 `DecisionStore`，自动记录决策

### LLM 集成 (`llm/`)

**LLMClient**: OpenRouter 兼容的 API 客户端
- 支持 `google/gemini-3-flash-preview` 等模型
- `chatJSON<T>()` — 结构化 JSON 输出 + 自动重试 + markdown fence 清理
- 支持代理（proxy）绕过区域限制

**WorldSerializer**: 将 WorldGraph 转为 LLM 可读文本
- 实体按类型分组，显示 ID 前8位 + 属性
- 关系显示为 `[src] —[type]→ [tgt]`
- ObjectiveSpec 转为 KPI 列表 + 约束列表

### MetaClaw 集成 (`metaclaw/`)

**Translator** (`translateToSkill()`):
- SimulationResult + RankedStrategy → 4段式 MetaClaw Skill
- 段落: 目标 / 策略 / 约束 / 上下文
- 可选 LLM 辅助翻译（更自然的指令文本）或纯模板生成
- `validateSkill()` — 检查必须字段、长度、结构完整性

**SkillManager**:
- 文件系统 CRUD: `active/` + `archived/` 目录 + `index.json` 索引
- 版本管理: 新版 `supersedes` 旧版 → 旧版自动归档
- 反馈统计: 记录 total_uses、avg_reward、feedback_count
- 抽象 `SkillFileSystem` 接口，支持 mock 测试和替换后端

**Feedback Processor** (`processFeedback()`):
- 预测偏差 > 10% → recalibrate 信号
- MetaClaw 新技能 → ontology_suggestion（世界模型可能有缺口）
- 异常事件 → pattern 记录
- 执行质量 < 0.5 → 策略难以执行的警告

---

## 5. 开发思路与设计决策

### 总体原则

1. **解耦优先** — 每层通过接口通信，不直接依赖实现。更换预测模型不影响模拟层。
2. **测试驱动** — 每个功能先写实现，立即写测试，确认通过后才继续。
3. **增量构建** — 不预建空目录，每层在实际需要时才创建。
4. **MVP 务实** — 用最简方案解决当前问题（内存存储、deep copy fork、手动标定系数）。

### 关键设计决策

| 决策 | 选择 | 理由 | 未来可替换为 |
|------|------|------|-------------|
| 存储 | 纯内存 Map/Set | demo 规模够快 | SQLite / PostgreSQL / Neo4j |
| Fork | full deep copy | 简化调试 | Copy-on-write（大图优化） |
| 预测 | 4种模型并存 | 不同场景不同模型最优 | 新增任何 PredictionModel 实现 |
| 树模型 | ml-random-forest | 纯JS，无需Python/WASM | XGBoost native / ONNX runtime |
| LLM | OpenRouter + Gemini | 统一API，多模型切换 | 直接调用各厂商API |
| 构建 | tsup (esbuild) | 快，ESM+CJS+dts 一步到位 | — |
| 测试 | vitest | 原生ESM，TS-first | — |
| ID | crypto.randomUUID() | 零依赖 | nanoid / ULID |

### 类型系统设计

- **Branded types** for IDs: `EntityId`, `RelationId`, `SnapshotId` 编译期互不可混。只在 `generateId() as EntityId` 处 cast。
- **ChangeResult 统一返回**: 每次 graph mutation 返回 `{ diffs, cascadeCount }`，为 L5 和 L6 提供变更追踪。
- **CascadeRule 声明式**: 领域包注册自己的 cascade rules，core 不包含任何领域知识。
- **ProbabilityDistribution 统一输出**: 所有预测返回 `{ mean, median, std, percentiles, confidence }`，不允许"裸数字"。

---

## 6. 测试覆盖

### 总览

```
Test Files:  10 passed (10)
Tests:       100 passed (100)
Duration:    ~6.5s
```

### 按模块明细

| 测试文件 | 测试数 | 状态 | 覆盖内容 |
|---------|-------|------|---------|
| `world-model/graph.test.ts` | 13 | ✅ | CRUD 实体/关系、类型查询、邻居遍历、属性更新、删除级联清理 |
| `world-model/cascade.test.ts` | 7 | ✅ | 单跳传播、多跳传播、maxDepth 限制、环检测、方向过滤、effect 跳过 |
| `world-model/fork.test.ts` | 7 | ✅ | 完整复制、隔离性、cascade rules 继承、标签、并行fork |
| `objective/objective.test.ts` | 7 | ✅ | KPI 计算、硬约束归零、软约束记录、阈值告警、世界对比、Tradeoff 调整 |
| `prediction/prediction.test.ts` | 15 | ✅ | 正态/偏态/点估计分布、ensemble 合并、空ensemble、HeuristicModel 规则匹配、StatisticalModel 线性预测、PredictionEngine 注册/ensemble/recalibrate/predictAll |
| `prediction/gradient-boost.test.ts` | 6 | ✅ | 训练+预测、未训练fallback、feature importance、ensemble集成、最少样本校验 |
| `simulation/simulation.test.ts` | 12 | ✅ | 单策略模拟、objective评估、cascade触发、推理链、风险档案、条件触发、预测引擎集成、多策略排序、硬约束排名、推理文本、原始世界不变 |
| `metaclaw/metaclaw.test.ts` | 13 | ✅ | 世界序列化、Skill翻译、验证、优先级、SkillManager CRUD/归档/反馈/列表、Feedback处理（偏差/新技能/异常/低质量） |
| `memory/memory.test.ts` | 12 | ✅ | DecisionStore CRUD/outcome/查询/recent、PatternMemory 添加/强化/去重/查询/置信度、Learning 准确→加分/偏差→校准/意外→建议/系统性偏差检测 |
| `loop/controller.test.ts` | 8 | ✅ | KPI告警检测、monitoring模式推荐、无告警静默、reactive模式强制运行、autonomous自动执行、DecisionStore集成、模式切换、启停 |

### 未覆盖的测试场景

- LLM 实际调用（需要 API key，当前只测试了 mock/fallback 路径）
- LLM 策略生成器（`llm-generator.ts` 的 `generateStrategiesWithLLM()` — 异步+外部依赖）
- 大规模图性能（当前测试用 <10 实体，未做 1000+ 压测）
- 并发 fork 的内存压力
- SkillManager 真实文件系统读写（当前用 mock FS）

---

## 7. 开发进展

### 时间线

| 阶段 | 内容 | 文件数 | 新测试 | 累计测试 | Commit |
|------|------|-------|-------|---------|--------|
| Day 1 | L1 World Model: 图谱 + Fork + Cascade | 18 | 27 | 27 | `a4d43c9` |
| Day 2 | L2 Objective Function + L3 Prediction Engine | 7+7 | 22 | 49 | `b9af6f9` |
| Day 3 | L4 Simulation & Strategy Engine | 3+1 | 12 | 61 | `b9af6f9` |
| Day 4 | LLM 集成 (Gemini) + MetaClaw 翻译层 | 10 | 13 | 74 | `e095b06` |
| +GB | GradientBoost 预测模型 | 2 | 6 | 80 | `1e9ad2a` |
| Day 7 | L5 Memory & Learning + L6 Decision Loop | 8 | 20 | 100 | `9d7dfee` |

### 当前状态

```
✅ L1 World Model        — 完成
✅ L2 Objective Function  — 完成
✅ L3 Prediction Engine   — 完成（4种模型）
✅ L4 Simulation & Strategy — 完成（含LLM策略生成）
✅ L5 Memory & Learning   — 完成
✅ L6 Decision Loop       — 完成
✅ LLM 集成              — 完成（OpenRouter/Gemini）
✅ MetaClaw 集成         — 完成（翻译+管理+反馈）
✅ GradientBoost 模型    — 完成

⬜ Demo 1: 法律策略模拟器   — 未开始
⬜ Demo 2: 内容运营决策引擎  — 未开始
⬜ Demo 3: 投资组合沙箱     — 未开始
⬜ 领域特化包 (legal/content/investment) — 未开始
⬜ 真实 MetaClaw 集成测试   — 未开始
⬜ GitHub Pages 部署       — 未开始
```

---

## 8. 未开发功能

### 按优先级排列

**P0: 近期必做**

| 功能 | 说明 | 阻塞什么 |
|------|------|---------|
| Demo 1: 法律策略模拟器 | React + Vite 前端，调用 @dcas/core | 产品演示 |
| 领域包 `packages/domains/legal/` | 法律 Ontology (Case, Judge, Statute)、预测规则、策略模板 | Demo 1 |
| LLM 端到端测试 | 用真实 Gemini API 跑一次完整的预测+策略生成 | 验证 LLM 集成有效 |

**P1: 中期增强**

| 功能 | 说明 |
|------|------|
| Demo 2: 内容运营 | 自媒体决策引擎，展示目标函数驱动 |
| Demo 3: 投资沙箱 | 展示世界分叉 + 多场景对比 |
| 持久化存储 | SQLite / better-sqlite3 替代内存 Map |
| Copy-on-Write Fork | 大图场景下的性能优化 |
| Adversary Model | 对手建模预测器（博弈场景） |
| MetaClaw 实际对接 | pip install metaclaw + 真实文件系统通信 |

**P2: 远期愿景**

| 功能 | 说明 |
|------|------|
| HTTP API 服务 | DCAS 作为独立服务，REST/gRPC 接口 |
| Event Bus | Redis/NATS 消息队列，支持多实例 |
| Ontology 自动发现 | 从数据中半自动发现新的实体类型和关系 |
| 跨域迁移学习 | 法律领域的"对手建模"模式迁移到商业谈判 |
| 信任仪表盘 | 可视化"系统推荐可信度" |

---

## 9. 已知问题与技术债务

### 技术问题

| 问题 | 严重程度 | 说明 | 解决方案 |
|------|---------|------|---------|
| esbuild 构建警告 | 低 | pnpm 提示 `Ignored build scripts: esbuild` | 已配置 `onlyBuiltDependencies`，不影响功能 |
| CRLF 警告 | 低 | Windows 环境 Git 自动转换行尾 | 可添加 `.gitattributes` |
| LLM predict() 同步限制 | 中 | `PredictionModel.predict()` 是同步接口，LLM 调用是异步。当前 sync predict() 返回 fallback | 需要在 Engine 层支持 async predict |
| 内存存储无持久化 | 中 | 所有数据在进程退出后丢失 | P1: 添加 SQLite 后端 |
| Cascade 目标属性硬编码 | 低 | `CascadeEffectResult` 已支持 `targetProperty`，但部分测试仍用同名属性 | 已解决，仅是测试简化 |

### 设计债务

| 问题 | 说明 |
|------|------|
| PredictionModel 同步接口 | 限制了 LLM 和其他异步模型。需要引入 `predictAsync()` 到接口定义 |
| ObjectiveSpec.kpis[].compute 是闭包 | 无法序列化/持久化。如果需要跨进程传递 ObjectiveSpec，需要用 DSL 或注册式 |
| PatternMemory 相似度判断过于简单 | 当前仅比较 entityTypes 排序 + observation 字符串精确匹配 |
| DecisionStore 无索引优化 | 全量扫描 + filter。千条以上需要添加索引 |

---

## 10. 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 9

### 安装与构建

```bash
cd dcas
pnpm install
pnpm build
```

### 运行测试

```bash
pnpm test
```

### 基本用法

```typescript
import {
  WorldGraph, forkGraph, evaluateObjective, compareStrategies,
  PredictionEngine, HeuristicModel, GradientBoostModel,
  DecisionStore, PatternMemory, learnFromOutcome,
  DecisionLoopController,
} from "@dcas/core";

// 1. 构建世界模型
const world = new WorldGraph();
const case1 = world.addEntity("Case", {
  strategy: "undecided",
  amount: 80000,
  evidence_strength: 7.2,
});
const judge = world.addEntity("Judge", { pro_labor_rate: 0.75 });
world.addRelation("decided_by", case1.id, judge.id);

// 2. 定义目标函数
const objective = {
  kpis: [{
    id: "recovery", name: "回收", direction: "maximize",
    weight: 0.6, target: 80000,
    compute: (w) => w.getEntitiesByType("Case")[0]?.properties.expected_recovery ?? 0,
  }],
  constraints: [{
    id: "min", description: "不低于50%", severity: "hard",
    check: (w) => (w.getEntitiesByType("Case")[0]?.properties.expected_recovery ?? 0) >= 40000,
  }],
  tradeoffs: [],
};

// 3. 定义候选策略
const strategies = [
  { id: "settle", name: "和解", actions: [
    { description: "回收6.5万", entityId: case1.id, property: "expected_recovery", value: 65000 },
  ], generatedBy: "template" },
  { id: "defend", name: "抗辩", actions: [
    { description: "回收4万", entityId: case1.id, property: "expected_recovery", value: 40000 },
  ], generatedBy: "template" },
];

// 4. 模拟对比
const ranked = compareStrategies(world, strategies, objective);
console.log(ranked.rankings[0].strategyName); // "和解"
console.log(ranked.rankings[0].reasoning);     // "在2个候选策略中综合得分最高..."

// 5. 记录决策 + 学习
const store = new DecisionStore();
const record = store.recordDecision({
  world, rankings: ranked, chosenStrategyId: "settle",
  chosenBy: "human", reasonForChoice: "综合最优",
  objectiveResult: ranked.rankings[0].objectiveResult,
});

// 事后录入实际结果
store.recordOutcome(record.id, {
  timestamp: Date.now(),
  actualKPIValues: { recovery: 62000 },
  deviations: { recovery: -0.046 },
  unexpectedEffects: [],
});

// 从偏差中学习
const patterns = new PatternMemory();
const updates = learnFromOutcome(store.get(record.id)!, patterns);
```

---

*Document Version: 1.0*
*Last Updated: 2026-03-21*
*Generated with assistance from Claude Opus 4.6*
