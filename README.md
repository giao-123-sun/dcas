# DCAS: Decision-Centric Agent System

> 把"一个聪明人做决策时脑子里转的东西"拆成六个独立模块，让每个模块可以单独进化、可替换、可追溯。

**版本**: 0.3.0 (Phase 0-5 complete)
**状态**: 全部 Phase 完成 | 3 领域包 | REST API | 171 tests | [Live Demo](https://giao-123-sun.github.io/dcas/)
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
│       │   │   ├── fork.ts            #   Copy-on-Write 世界分叉
│       │   │   └── event-log.ts       #   事件溯源日志（append-only, 时间旅行）
│       │   │
│       │   ├── objective/             # L2: 目标函数
│       │   │   ├── types.ts           #   KPI, Constraint, Tradeoff 类型
│       │   │   └── objective.ts       #   evaluateObjective(), compareWorlds()
│       │   │
│       │   ├── prediction/            # L3: 预测引擎
│       │   │   ├── types.ts           #   ProbabilityDistribution, PredictionModel 接口
│       │   │   ├── distribution.ts    #   normal/skewed/point/ensemble 分布工具
│       │   │   ├── engine.ts          #   PredictionEngine（注册、ensemble、recalibrate）
│       │   │   ├── sampler.ts         #   蒙特卡洛采样器（Box-Muller, seeded PRNG）
│       │   │   └── models/
│       │   │       ├── heuristic.ts   #   规则匹配预测（领域专家知识）
│       │   │       ├── statistical.ts #   线性回归预测
│       │   │       ├── gradient-boost.ts # 树模型集成预测（RandomForest）
│       │   │       ├── llm.ts         #   LLM预测（Gemini via OpenRouter）
│       │   │       └── adversary.ts   #   对手行为建模（历史模式 + optional LLM）
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
│       │   ├── config.ts              #   DCASConfig + DEFAULT_CONFIG + mergeConfig()
│       │   │
│       │   ├── i18n/                  # 国际化
│       │   │   ├── zh.ts             #   中文字符串
│       │   │   └── en.ts             #   英文字符串（setLocale(en) 切换）
│       │   │
│       │   ├── utils/
│       │   │   └── id.ts              #   UUID 生成
│       │   │
│       │   └── index.ts               #   Barrel export（公共API）
│       │
│       ├── tests/                     # 测试（镜像 src 结构）
│       │   ├── world-model/           #   graph.test.ts, cascade.test.ts, fork.test.ts, event-log.test.ts
│       │   ├── objective/             #   objective.test.ts
│       │   ├── prediction/            #   prediction.test.ts, gradient-boost.test.ts, sampler.test.ts, adversary.test.ts
│       │   ├── simulation/            #   simulation.test.ts
│       │   ├── memory/                #   memory.test.ts
│       │   ├── loop/                  #   controller.test.ts
│       │   ├── metaclaw/              #   metaclaw.test.ts
│       │   └── config.test.ts         #   DCASConfig 默认值 + mergeConfig 深合并
│       │
│       ├── package.json               #   @dcas/core 包配置
│       ├── tsconfig.json
│       ├── tsup.config.ts             #   构建配置（ESM + CJS + d.ts）
│       └── vitest.config.ts           #   测试配置
│
│   └── domains/
│       └── legal/                     # @dcas/legal — 法律领域包
│           ├── src/
│           │   ├── ontology.ts        #   Case/Party/Judge/Statute/Evidence/Precedent 类型
│           │   ├── seed-data.ts       #   4 个法条、3 个法官、3 个判例预加载数据
│           │   ├── cascade-rules.ts   #   法律级联规则（法官分配→胜诉率→预期赔偿）
│           │   ├── predictions.ts     #   HeuristicModel 规则集
│           │   ├── strategies.ts      #   策略模板（和解/抗辩/异议/分步）
│           │   ├── objective.ts       #   法律场景目标函数
│           │   └── index.ts
│           └── tests/
│               └── legal.test.ts      #   8 个法律领域集成测试
│
├── demos/
│   └── legal-strategy/                # Demo 1 — 法律策略模拟器（React + Vite）
│       ├── src/
│       │   ├── App.tsx                #   主应用
│       │   ├── InputPanel.tsx         #   参数输入（案件类型/标的额/证据强度滑块）
│       │   ├── StrategyCard.tsx       #   策略结果卡片
│       │   ├── ChartPanel.tsx         #   Recharts 柱状图 + 雷达图
│       │   ├── ReasoningPanel.tsx     #   推理链展示
│       │   └── crypto-shim.ts         #   node:crypto 浏览器兼容 shim
│       ├── index.html
│       ├── package.json
│       └── vite.config.ts
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

**文件统计**: ~45 个核心源文件, 7 个法律领域源文件, 7 个 Demo 源文件, 15 个测试文件, 4 张架构图 (~4,800 LOC 源码 + ~2,500 LOC 测试)

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
Test Files:  15 passed (15)
Tests:       140 passed (140)
Duration:    ~8s
```

### 按模块明细

| 测试文件 | 测试数 | 状态 | 覆盖内容 |
|---------|-------|------|---------|
| `world-model/graph.test.ts` | 13 | ✅ | CRUD 实体/关系、类型查询、邻居遍历、属性更新、删除级联清理 |
| `world-model/cascade.test.ts` | 7 | ✅ | 单跳传播、多跳传播、maxDepth 限制、环检测、方向过滤、effect 跳过 |
| `world-model/fork.test.ts` | 7 | ✅ | CoW fork 隔离性、O(1) 分叉、首次写触发拷贝、cascade rules 继承、并行fork |
| `world-model/event-log.test.ts` | — | ✅ | append/query/时间旅行/序列化反序列化 |
| `objective/objective.test.ts` | 7 | ✅ | KPI 计算、硬约束归零、软约束记录、阈值告警、世界对比、Tradeoff 调整 |
| `prediction/prediction.test.ts` | 15 | ✅ | 正态/偏态/点估计分布、ensemble 合并、空ensemble、HeuristicModel 规则匹配、StatisticalModel 线性预测、PredictionEngine 注册/ensemble/recalibrate/predictAll |
| `prediction/gradient-boost.test.ts` | 6 | ✅ | 训练+预测、未训练fallback、feature importance、ensemble集成、最少样本校验 |
| `prediction/sampler.test.ts` | — | ✅ | seeded RNG 可复现、Box-Muller 统计验证、std=0 退化为确定性、经验分布采样 |
| `prediction/adversary.test.ts` | — | ✅ | 历史行为建模、LLM fallback、对手行动采样 |
| `simulation/simulation.test.ts` | 12+ | ✅ | 蒙特卡洛多跑相同 seed 可复现、不同 seed 结果有差、std>0、提前收敛、backward compat、原始世界不变 |
| `metaclaw/metaclaw.test.ts` | 13 | ✅ | 世界序列化、Skill翻译、验证、优先级、SkillManager CRUD/归档/反馈/列表、Feedback处理（偏差/新技能/异常/低质量） |
| `memory/memory.test.ts` | 12 | ✅ | DecisionStore CRUD/outcome/查询/recent、PatternMemory 添加/强化/去重/查询/置信度、Learning 准确→加分/偏差→校准/意外→建议/系统性偏差检测 |
| `loop/controller.test.ts` | 8 | ✅ | KPI告警检测、monitoring模式推荐、无告警静默、reactive模式强制运行、autonomous自动执行、DecisionStore集成、模式切换、启停 |
| `config.test.ts` | — | ✅ | DEFAULT_CONFIG 字段完整、mergeConfig 深合并、局部覆盖不影响其他默认值 |
| `legal/legal.test.ts` | 8 | ✅ | 法律 ontology、seed data 加载、cascade 级联（法官分配→胜诉率）、策略模板、目标函数评分 |

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
| Phase 0 | 基础设施修复（async pipeline, config, bug fixes） | +5 | +~15 | ~115 | `278a8ad`, `cb7fca0` |
| Phase 1 | Monte Carlo 模拟引擎（sampler, CoV 收敛） | +3 | +~10 | ~125 | `b46af06` |
| Phase 2 | 事件溯源 + CoW Fork + 时间旅行 | +2 | +~7 | ~132 | `662bc64` |
| Phase 3 | 对手建模 + @dcas/legal 领域包 | +8 | +8 | ~140 | `662bc64` |
| Phase 4.1 | Demo 前端（React + Vite + Recharts） | +7 | — | 140 | `435866a` |
| Code Review | 8 个 critical/high bug 修复 | — | — | 140 | `9ac8e89` |
| i18n | 全部中文字符串提取到 i18n + LLM prompts | +3 | — | 140 | `d73d651` |
| Phase 4.2 | SQLite 持久化层（better-sqlite3） | +2 | +7 | 147 | `20fc828` |
| Phase 4.3 | GitHub Actions CI + Pages 部署 | +1 | — | 147 | `48d5ccf` |
| Phase 5.2+5.3 | HTTP REST API + 内容运营领域包 | +17 | +12 | 159 | `ebb36ec` |
| Phase 5.4 | 投资组合领域包 | +9 | +7 | 166 | — |
| Phase 5.5 | LLM Entity Extractor（Ontology 半自动构建） | +2 | +5 | 171 | — |

### 当前状态

```
✅ L1 World Model        — 完成（含 EventLog + CoW Fork + 时间旅行）
✅ L2 Objective Function  — 完成
✅ L3 Prediction Engine   — 完成（4种模型 + 对手建模）
✅ L4 Simulation & Strategy — 完成（蒙特卡洛 N-run + LLM策略生成）
✅ L5 Memory & Learning   — 完成
✅ L6 Decision Loop       — 完成
✅ LLM 集成              — 完成（OpenRouter/Gemini）
✅ MetaClaw 集成         — 完成（翻译+管理+反馈）
✅ GradientBoost 模型    — 完成
✅ 基础设施（Phase 0）    — 完成（async pipeline, DCASConfig, bug fixes）
✅ Monte Carlo 模拟引擎  — 完成（seeded PRNG, Box-Muller, CoV 早停）
✅ 事件溯源 + CoW Fork   — 完成
✅ 对手建模              — 完成（AdversaryModel）
✅ @dcas/legal 领域包    — 完成（4法条 + 3法官 + 3判例 + 级联规则）
✅ Demo 1: 法律策略模拟器 — 完成（React + Vite + Recharts）
✅ i18n 国际化           — 完成（zh/en 双语 + LLM prompt 模板提取）
✅ Code Review 修复      — 完成（8 个 critical/high bug）
✅ SQLite 持久化层        — 完成（better-sqlite3, WAL mode）
✅ GitHub Actions CI      — 完成（build→test→deploy to Pages）
✅ HTTP REST API          — 完成（Express, /simulate /feedback /history /patterns）
✅ @dcas/content 领域包   — 完成（账号/竞品/平台/内容计划 + 3策略）
✅ @dcas/investment 领域包 — 完成（组合/资产/宏观因子 + 3调仓策略）
✅ LLM Entity Extractor   — 完成（文本→实体关系 + 智能去重匹配）

⬜ 真实 MetaClaw 集成测试     — 未开始（Phase 5.1）
⬜ Demo 2: 内容运营前端       — 待开发
⬜ Demo 3: 投资组合前端       — 待开发
```

---

## 8. 未开发功能

### 已完成（Phase 0–4.1）

| 功能 | 完成 Commit |
|------|------------|
| Demo 1: 法律策略模拟器（React + Vite + Recharts） | `435866a` |
| @dcas/legal 领域包（法条/法官/判例/级联/策略模板） | `662bc64` |
| Monte Carlo 模拟引擎（sampler, seeded PRNG, CoV 收敛） | `b46af06` |
| 事件溯源 EventLog + Copy-on-Write Fork + 时间旅行 | `662bc64` |
| 对手建模 AdversaryModel | `662bc64` |
| Async predict→simulate→compare→decide 管道 | `cb7fca0` |
| DCASConfig magic numbers 提取 | `cb7fca0` |
| i18n 国际化（zh/en + LLM prompt 模板） | `d73d651` |
| Code Review 8 项 critical/high bug 修复 | `9ac8e89` |

| SQLite 持久化层（better-sqlite3） | `20fc828` |
| GitHub Actions CI + Pages 部署 | `48d5ccf` |
| HTTP REST API（Express, 4端点） | `ebb36ec` |
| @dcas/content 内容运营领域包 | `ebb36ec` |
| @dcas/investment 投资组合领域包 | 本次提交 |
| LLM Entity Extractor（半自动 ontology 构建） | 本次提交 |

### 待开发

**P0: 近期**

| 功能 | 说明 |
|------|------|
| MetaClaw 真实对接 | pip install metaclaw + 文件系统 Skill 注入 + 反馈回收 |
| Demo 2: 内容运营前端 | React + Vite，展示内容策略对比 |
| Demo 3: 投资组合前端 | React + Vite，展示平行世界 + 宏观因子场景对比 |

**P1: 中期**

| 功能 | 说明 | Phase |
|------|------|-------|
| MetaClaw 真实对接 | pip install metaclaw + 真实技能文件通信 | 5.1 |
| HTTP API 服务 | DCAS 作为独立 REST 服务 | 5.2 |
| Demo 2: 内容运营 | 自媒体决策引擎，目标函数驱动 | 5.3 |
| Demo 3: 投资沙箱 | 世界分叉 + 多场景对比可视化 | 5.4 |

**P2: 远期愿景**

| 功能 | 说明 | Phase |
|------|------|-------|
| Ontology 自动发现 | LLM 辅助从数据半自动发现新实体类型和关系 | 5.5 |
| Event Bus | Redis/NATS 消息队列，支持多实例 | — |
| 跨域迁移学习 | 法律领域的对手建模模式迁移到商业谈判 | — |
| 信任仪表盘 | 可视化"系统推荐可信度" | — |

---

## 9. 已知问题与技术债务

### 已修复（Phase 0 + Code Review）

| 问题 | 修复方式 | Commit |
|------|---------|--------|
| PredictionModel.predict() 同步接口 → LLM 被旁路 | 全链路改为 async，LLM 真正参与 ensemble | `cb7fca0` |
| 20+ magic numbers 硬编码 | 全部提取到 DCASConfig + mergeConfig() | `cb7fca0` |
| GradientBoostModel.type = "statistical" 与 StatisticalModel 冲突 | type 改为 "gradient_boost" | `278a8ad` |
| controller.start() 重复调用泄漏 timer | start() 开头加 clearInterval 保护 | `cb7fca0` |
| graph.ts 多处 `!` 非空断言 | 替换为 null-check guard 或 throw | `cb7fca0` |
| cascade visited key 用 `:` 分隔可能碰撞 | 改为 `\0` null byte 分隔 | `cb7fca0` |
| 空数组越界访问（Code Review #1） | 边界检查修复 | `9ac8e89` |
| 静默 catch 块吞掉错误（Code Review #2） | 改为 re-throw 或 log | `9ac8e89` |
| sort() 副作用修改原数组（Code Review #3） | 改为 [...arr].sort() | `9ac8e89` |

### 现存技术债务

| 问题 | 严重程度 | 说明 | 解决方向 |
|------|---------|------|---------|
| `as any` in gradient-boost.ts | 低 | ml-random-forest 内部类型无导出，必须 cast | 等上游导出类型或写本地 d.ts |
| LLM prompt 注入风险 | 中 | chatJSON 的 prompt 未对用户输入做 sanitization | Phase 4.2 前添加输入过滤 |
| chatJSON 无运行时 schema 校验 | 中 | LLM 返回 JSON 只做 parse，无 shape 验证 | 引入 zod 或 ajv 校验 |
| predictProperties 是 string[] | 低 | 无法精确指定 entityId，MC 采样时靠启发式匹配实体 | 改为 `{entityId, property}[]` |
| EventLog 不记录 entity/relation add/remove | 低 | 只记录属性变更，新增/删除实体不进日志 | 补充 entity-level event types |
| Demo 无 debounce / AbortController | 低 | 快速拖动滑块触发多次模拟并发请求 | 加 500ms debounce + AbortController |
| esbuild 构建警告 | 低 | pnpm 提示 `Ignored build scripts: esbuild` | 已配置 `onlyBuiltDependencies`，不影响功能 |
| 内存存储无持久化 | 中 | 所有数据在进程退出后丢失 | Phase 4.2: SQLite 后端 |
| ObjectiveSpec.kpis[].compute 是闭包 | 低 | 无法序列化/持久化跨进程传递 | 用 DSL 或注册式函数替代 |
| DecisionStore 无索引优化 | 低 | 全量扫描 + filter，千条以上需优化 | Phase 4.2 SQLite 自带索引 |

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

*Document Version: 2.0*
*Last Updated: 2026-03-24*
*Generated with assistance from Claude Sonnet 4.6*
