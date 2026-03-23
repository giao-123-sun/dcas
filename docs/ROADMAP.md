# DCAS 完整开发路线图 v2

## Context

### 我们是谁
Agioa 内部项目 DCAS (Decision-Centric Agent System)——把"目标驱动型 Agent"的决策过程解耦为六层可独立演进的模块。

### 当前状态
- 6 层骨架代码完成：3,053 行源码，31 个文件，100 个测试全绿
- 技术栈：TypeScript ESM, pnpm workspaces, tsup, vitest, ml-random-forest
- LLM：OpenRouter (gemini-3-flash-preview)，需 proxy:7890 绕区域限制
- Git：5 commits on master, repo at E:/test/cc/ontology/

### 愿景 vs 现实的差距
| 愿景文档描述 | 当前实现 | 差距严重程度 |
|------------|---------|------------|
| 蒙特卡洛采样模拟 | 确定性属性赋值 | 🔴 致命 |
| async 预测管道 | sync 接口，LLM 返回垃圾值 | 🔴 致命 |
| 事件溯源 + CoW Fork | 直接修改 Map + structuredClone 全量复制 | 🟡 重要 |
| 对手建模 | 完全缺失 | 🟡 重要 |
| 领域知识图谱（法条/判例/法官） | 图谱空的，测试用手写 fixture | 🟡 重要 |
| 四种计算引擎精确分工 | LLM/ML 名义集成但管道断路 | 🔴 致命 |
| 可配置阈值 | 20+ magic numbers 硬编码 | 🟠 中等 |
| 前端 Demo | 不存在 | 🟡 重要（演示需要） |

### 竞争定位
- **开源唯一空白**: 可 fork 的图结构世界模型（Graphiti 有时序图不能 fork，Palantir 可以但闭源）
- **最近的理论框架**: LeCun 六模块架构（AMI Labs, $1.03B 融资，连续潜空间非图结构）
- **最成熟的模拟循环**: DreamerV3（RL 专用，不泛化到企业决策）
- **关键人物**: Huaxiu Yao (MetaClaw), Shunyu Yao (CoALA), Graphiti/Zep team, Tsinghua DI Lab

### 四种计算引擎在 DCAS 中的角色

```
图谱(KG):  存储实体关系、路径遍历、级联传播的骨架
LLM:       非结构化→结构化、推理型预测、策略生成、偏差解释
ML模型:    结构化特征→数值预测（XGBoost/RandomForest）
概率/统计:  不确定性量化、蒙特卡洛采样、分布集成、贝叶斯估计
```

每一层的引擎参与比例（█ = 主要，░ = 辅助）：
```
L1 World Model:   KG████████  LLM██░       ML       概率
L2 Objective:     KG░░        LLM          ML░░     概率
L3 Prediction:    KG░░        LLM████      ML█████  概率████
L4 Simulation:    KG████      LLM███       ML       概率████████
L5 Memory:        KG███       LLM████      ML██     概率█
L6 Loop:          KG█         LLM          ML       概率█
```

---

## Phase 0: 基础设施修复

**目标**: 修复已知 bug 和架构缺陷，让代码从"能跑"变成"可信"。
**预估**: ~1 天
**可并行**: 0.1/0.3/0.4 可以三人并行，0.2 是核心需要一人集中做

---

### Task 0.1: 修复 GradientBoostModel type bug

**问题**: `gradient-boost.ts:62` 的 `type = "statistical"` 与 StatisticalModel 重复
**影响**: PredictionEngine 按 model.type 分流时两种模型混淆

**修改文件**:
- `packages/core/src/prediction/models/gradient-boost.ts` — 改 type 为 `"gradient_boost"`

**测试要求**:
```
新增测试 in prediction.test.ts:
  "should distinguish gradient_boost from statistical model by type"
  - 注册一个 StatisticalModel 和一个 GradientBoostModel 到同一属性
  - 验证 engine.getModelsForProperty() 返回 2 个模型
  - 验证 model.type 分别为 "statistical" 和 "gradient_boost"
```

**验收标准**: `pnpm test` 全绿，grep 全代码库无 `type = "statistical"` 出现在 gradient-boost 文件中

---

### Task 0.2: PredictionModel 接口改为 async ⭐ 关键任务

**问题**: PredictionModel.predict() 是 sync，导致 LLMPredictionModel 在 ensemble 中返回无意义的 fallback 值
**影响**: LLM 名义上集成但实际被旁路，整个 L3→L4 管道对 LLM 预测无效

**修改文件（按顺序）**:

1. **`prediction/types.ts`**
   - `PredictionModel.predict()` 返回值改为 `Promise<ProbabilityDistribution>`
   - 新增注释说明所有 model 实现必须是 async

2. **`prediction/models/heuristic.ts`**
   - `predict()` 前加 `async`，返回 `Promise.resolve(result)`
   - 逻辑不变，只是包装为 Promise

3. **`prediction/models/statistical.ts`**
   - 同上，加 `async`

4. **`prediction/models/gradient-boost.ts`**
   - 同上，加 `async`

5. **`prediction/models/llm.ts`**
   - 删除 sync `predict()` 的垃圾 fallback
   - 把 `predictAsync()` 的逻辑直接放到 `predict()` 里
   - `predict()` 现在返回 `Promise<ProbabilityDistribution>`（真正调 LLM）

6. **`prediction/engine.ts`**
   - `predict()` → `async predict()`
   - `ensemble()` → `async ensemble()`：内部用 `Promise.all()` 并行调用所有模型
   - `predictAll()` → `async predictAll()`
   - `recalibrate()` 不变（不涉及预测调用）

7. **`prediction/distribution.ts`**
   - 不变（纯计算函数）

8. **`simulation/simulator.ts`**
   - `simulateStrategy()` → `async simulateStrategy()`
   - 内部 `predictionEngine.predictAll()` 加 `await`

9. **`simulation/comparator.ts`**
   - `compareStrategies()` → `async compareStrategies()`
   - `simulateAll()` → `async simulateAll()`
   - 内部 `simulateStrategy()` 调用加 `await`
   - 可选优化：`Promise.all()` 并行模拟多个策略

10. **`loop/controller.ts`**
    - `runCycle()` → `async runCycle()`
    - `compareStrategies()` 加 `await`

11. **`metaclaw/translator.ts`**
    - 已经是 async，但内部调用 `simulateStrategy` 需要 await（检查是否已处理）

12. **所有测试文件** (10 个):
    - 所有调用 predict/ensemble/simulateStrategy/compareStrategies 的地方加 `await`
    - 测试函数签名加 `async`
    - vitest 原生支持 async 测试，无需额外配置

**新增测试**:
```
新增 in prediction.test.ts:
  "LLM model should participate in ensemble (mock)"
  - 创建一个 mock LLMPredictionModel（不调真 API，内部返回固定值 mean=70000）
  - 创建一个 HeuristicModel（返回 mean=50000）
  - 两者注册到同一属性
  - await engine.ensemble()
  - 验证 combined.mean 在 50000 和 70000 之间（证明 LLM 值被使用了）
  - 验证 combined.mean 不等于 50000（证明不是只用了 heuristic）
```

**验收标准**:
- [ ] `pnpm test` 100+ tests 全绿
- [ ] `pnpm build` 零 DTS 错误
- [ ] LLMPredictionModel 不再有 sync `predict()` 和 `predictAsync()` 分裂
- [ ] 新增的 "LLM mock ensemble" 测试通过
- [ ] grep `predictAsync` 全代码库无结果（已合并到 predict）

---

### Task 0.3: 提取 magic numbers 为配置对象

**问题**: 20+ 个硬编码阈值散布各文件，不同领域无法定制

**新增文件**: `packages/core/src/config.ts`

**Config 结构**:
```typescript
export interface DCASConfig {
  prediction: {
    /** EMA权重，用于 recalibrate() 更新模型准确度 */
    recalibrateEmaWeight: number;        // 默认 0.8
    /** 预测分布的最小标准差 */
    minStd: number;                       // 默认 0.01
    /** ensemble 中 between-model disagreement 的惩罚因子 */
    ensembleDisagreementPenalty: number;   // 默认 1.0
  };
  objective: {
    /** Tradeoff 权重调整的最大偏移量 */
    maxTradeoffShift: number;             // 默认 0.1
  };
  simulation: {
    /** 无预测引擎时 risk profile 的乐观乘数 */
    riskBestCaseMultiplier: number;       // 默认 1.2
    /** 无预测引擎时 risk profile 的悲观乘数 */
    riskWorstCaseMultiplier: number;      // 默认 0.7
  };
  learning: {
    /** 低于此偏差视为"准确" */
    smallDeviationThreshold: number;      // 默认 0.05
    /** 高于此偏差视为"严重偏差" */
    largeDeviationThreshold: number;      // 默认 0.15
    /** 系统性偏差检测需要的最小样本数 */
    minSamplesForBiasDetection: number;   // 默认 3
    /** 系统性偏差检测的同方向比例阈值 */
    biasDirectionThreshold: number;       // 默认 0.7
  };
  pattern: {
    /** Pattern 最多保留的示例 ID 数 */
    maxExamples: number;                  // 默认 10
    /** 每次强化时 confidence 的增量因子 */
    reinforceRate: number;                // 默认 0.1
    /** confidence 上限 */
    maxConfidence: number;                // 默认 0.99
  };
  controller: {
    /** KPI 告警严重程度阈值（normalizedScore 低于此为 critical） */
    criticalScoreThreshold: number;       // 默认 0.3
  };
  metaclaw: {
    /** 反馈偏差超过此值触发 recalibration 信号 */
    feedbackDeviationThreshold: number;   // 默认 0.1
    /** 执行质量低于此值标记为"低质量" */
    lowQualityRewardThreshold: number;    // 默认 0.5
  };
}

export const DEFAULT_CONFIG: DCASConfig = { ... };

/** 深合并用户配置和默认配置 */
export function mergeConfig(partial: DeepPartial<DCASConfig>): DCASConfig;
```

**修改文件**:
- 每个使用 magic number 的文件在构造函数或函数参数中接受 `config?: Partial<DCASConfig>`
- 具体改动清单：

| 文件 | 行号 | 当前值 | config key |
|------|------|--------|-----------|
| prediction/engine.ts | ~107 | 0.8, 0.2 | prediction.recalibrateEmaWeight |
| prediction/distribution.ts | ~118 | disagreement/maxMean | prediction.ensembleDisagreementPenalty |
| prediction/models/gradient-boost.ts | ~119,132 | 10000, 0.01 | prediction.minStd |
| objective/objective.ts | ~90 | 0.1 | objective.maxTradeoffShift |
| simulation/simulator.ts | ~114,115 | 1.2, 0.7 | simulation.riskBestCase/WorstCaseMultiplier |
| memory/learning.ts | ~8,9 | 0.05, 0.15 | learning.small/largeDeviationThreshold |
| memory/learning.ts | ~131,139 | 3, 0.7 | learning.minSamples, biasDirectionThreshold |
| memory/pattern.ts | ~31,32,35 | 0.99, 0.1, 10 | pattern.maxConfidence, reinforceRate, maxExamples |
| loop/controller.ts | ~91 | 0.3 | controller.criticalScoreThreshold |
| metaclaw/feedback.ts | ~24,68 | 0.1, 0.5 | metaclaw.feedbackDeviation/lowQualityReward |

**测试要求**:
```
新增 in config.test.ts:
  "should use default config when no override provided"
  - 验证 DEFAULT_CONFIG 的所有字段都有值

  "should deep merge partial config"
  - mergeConfig({ learning: { smallDeviationThreshold: 0.01 } })
  - 验证 learning.smallDeviationThreshold === 0.01
  - 验证 learning.largeDeviationThreshold === 0.15（未覆盖的保持默认）

  "should change behavior with different config"
  - 用 smallDeviationThreshold=0.5 跑 learnFromOutcome
  - 一个 10% 偏差应该被视为"准确"（因为阈值改成了50%）
  - 用默认 config 跑同一数据，10% 偏差应在 accurate 和 large 之间
```

**验收标准**:
- [ ] grep 全代码库 `0\.05|0\.15|0\.8[^0].*0\.2` 不再出现在业务逻辑中
- [ ] 每个类/函数都可以接受可选的 config 参数
- [ ] 新增的 config 测试全绿

---

### Task 0.4: 修复其他小 bug

**问题列表和修复方案**:

| 问题 | 文件 | 修复 |
|------|------|------|
| controller.start() 重复调用泄漏 timer | loop/controller.ts | start() 开头加 `if (this.timer) clearInterval(this.timer)` |
| graph.ts 多处 `!` 非空断言 | world-model/graph.ts | 替换为 `if (!entity) continue` 或 `throw new Error(...)` |
| cascade visited key 用 `:` 分隔可能碰撞 | world-model/cascade.ts | 改为 `\0` (null byte) 分隔 |
| WorldSerializer ID 截断 8 字符可能碰撞 | llm/world-serializer.ts | 改为 12 字符 |

**测试要求**:
```
新增 in controller.test.ts:
  "should handle double start() without timer leak"
  - 调用 start(), start(), stop()
  - 验证 isRunning === false（无残留 timer）

新增 in graph.test.ts:
  "should handle corrupted index gracefully"
  - 手动在 outgoing map 里插入一个不存在的 relation ID
  - 调用 getNeighbors() 应返回空或跳过，不崩溃
```

**验收标准**:
- [ ] grep `as any` 全代码库只出现在 branded type cast 和 test fixture 中
- [ ] grep `\.get\(.*\)!` 全代码库无结果（除非有 null check guard）
- [ ] 新增测试全绿

---

### Phase 0 总验收清单

- [ ] `pnpm build` 零警告零错误
- [ ] `pnpm test` 全绿，测试数量 ≥ 105（原 100 + 至少 5 个新增）
- [ ] PredictionModel.predict() 签名是 `Promise<ProbabilityDistribution>`
- [ ] LLMPredictionModel 无 sync predict / predictAsync 分裂
- [ ] 所有 magic number 可通过 DCASConfig 覆盖
- [ ] 无 timer 泄漏，无非空断言 `!`，无 `as any`（除白名单）
- [ ] git commit 并 push

---

## Phase 1: 真正的模拟引擎

**目标**: `simulateStrategy` 从确定性赋值变成蒙特卡洛采样，输出结果分布。
**预估**: ~1 天
**依赖**: Phase 0.2 (async 接口)
**可并行**: 1.1 和 1.2 必须顺序，1.3 可在 1.2 完成后独立做

---

### Task 1.1: 概率分布采样器

**新增文件**: `packages/core/src/prediction/sampler.ts`

**功能**:
```typescript
/**
 * 从 ProbabilityDistribution 中随机抽取一个样本值。
 * 这是蒙特卡洛模拟的核心原语。
 */
export function sampleFromDistribution(
  dist: ProbabilityDistribution,
  rng?: () => number  // 可注入随机数生成器（测试用固定 seed）
): number;

/**
 * Box-Muller 变换：从均匀分布生成正态分布样本
 */
export function sampleNormal(mean: number, std: number, rng?: () => number): number;

/**
 * 从经验分布（样本数组）中随机抽取
 */
export function sampleEmpirical(samples: number[], rng?: () => number): number;

/**
 * 可 seed 的伪随机数生成器（用于可复现的测试）
 */
export function createSeededRng(seed: number): () => number;
```

**设计要点**:
- 默认用 `Math.random()`，但可注入 seeded RNG 用于测试可复现性
- 正态采样用 Box-Muller 变换（两个均匀 → 两个正态）
- 如果 dist.std === 0，直接返回 mean（确定性退化）

**测试要求**:
```
新增 prediction/sampler.test.ts:
  "sampleNormal with fixed seed should be reproducible"
  - 用 seed=42 采样 1000 次
  - 再用 seed=42 采样 1000 次
  - 两组结果完全相同

  "sampleNormal distribution statistics should match parameters"
  - mean=50000, std=10000
  - 采样 10000 次
  - 样本均值在 49000-51000 之间
  - 样本标准差在 9000-11000 之间

  "sampleFromDistribution with std=0 returns mean exactly"
  - dist = pointEstimate(42, 1.0, "test")
  - 采样 100 次，全部等于 42

  "sampleEmpirical should return values from the input array"
  - samples = [1, 2, 3]
  - 采样 100 次，所有值都在 {1, 2, 3} 中
```

---

### Task 1.2: 重写 simulateStrategy 为蒙特卡洛模拟 ⭐ 关键任务

**修改文件**: `packages/core/src/simulation/simulator.ts`

**新增类型** (in `simulation/types.ts`):
```typescript
export interface MonteCarloConfig {
  /** 蒙特卡洛运行次数 */
  runs: number;                    // 默认 100
  /** 最大模拟步数 */
  maxSteps: number;                // 默认 10
  /** 随机数种子（可选，用于可复现性） */
  seed?: number;
  /** 是否保留每次 run 的原始结果（用于调试/可视化） */
  keepPerRunResults?: boolean;     // 默认 false
  /** 提前停止的收敛阈值（变异系数 < 此值则停止） */
  convergenceThreshold?: number;   // 默认 0.05
  /** 提前停止的最小运行次数 */
  minRunsBeforeConvergence?: number; // 默认 30
}

// SimulationResult 新增字段
export interface SimulationResult {
  // ... 保留所有现有字段
  monteCarloRuns: number;
  kpiDistributions: Map<string, ProbabilityDistribution>;
  perRunResults?: Array<Record<string, number>>;
  converged: boolean;
}
```

**新的 simulateStrategy 伪代码**:
```typescript
async function simulateStrategy(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
): Promise<SimulationResult> {
  const config = { runs: 100, maxSteps: 10, ...mcConfig };
  const rng = config.seed != null ? createSeededRng(config.seed) : undefined;
  const allKpiValues: Record<string, number[]> = {};
  const reasoning: string[] = [];
  const perRunResults: Array<Record<string, number>> = [];
  let lastFork: WorldGraph | null = null;

  for (let run = 0; run < config.runs; run++) {
    const fork = forkGraph(world, `${strategy.name}_mc${run}`);

    for (let step = 0; step < Math.min(strategy.actions.length, config.maxSteps); step++) {
      const action = strategy.actions[step];
      // 1. 确定性动作
      fork.updateProperty(action.entityId, action.property, action.value);

      // 2. 条件触发
      if (strategy.conditionals) { ... }

      // 3. 预测 + 采样（蒙特卡洛的核心）
      if (predictionEngine && predictProperties) {
        for (const prop of predictProperties) {
          const dist = await predictionEngine.ensemble(fork, prop);
          const sampled = sampleFromDistribution(dist.combined, rng);
          // 找到相关实体并更新
          // 注意：这里需要知道是哪个实体的属性
          // 需要扩展 predictProperties 为 { entityId, property } 对
        }
      }
    }

    // 评估本次 run 的 KPI
    const objResult = evaluateObjective(objective, fork);
    for (const kr of objResult.kpiResults) {
      if (!allKpiValues[kr.kpiId]) allKpiValues[kr.kpiId] = [];
      allKpiValues[kr.kpiId].push(kr.value);
    }
    if (config.keepPerRunResults) {
      perRunResults.push(Object.fromEntries(objResult.kpiResults.map(r => [r.kpiId, r.value])));
    }

    if (run === 0) lastFork = fork; // 保留第一个 fork 用于 reasoning

    // 提前停止检查
    if (run >= (config.minRunsBeforeConvergence ?? 30)) {
      const cv = coefficientOfVariation(allKpiValues[objective.kpis[0].id]);
      if (cv < (config.convergenceThreshold ?? 0.05)) break;
    }
  }

  // 汇总为分布
  const kpiDistributions = new Map<string, ProbabilityDistribution>();
  for (const [kpiId, values] of Object.entries(allKpiValues)) {
    kpiDistributions.set(kpiId, empiricalDistribution(values));
  }

  // 构建 reasoning（从第一个 run 的 fork 中提取）
  // ...

  return { ..., monteCarloRuns: actualRuns, kpiDistributions, perRunResults, converged };
}
```

**设计决策**:
- 每次 MC run 内部用 `forkGraph()` 创建独立分支（Phase 2 后变为 O(1)）
- 预测引擎在每步被调用，从分布中采样（而非用 mean）
- 支持提前停止（方差收敛后不再浪费资源）
- 保留向后兼容：如果 mcConfig.runs === 1 且无预测引擎，退化为原有确定性行为

**测试要求**:
```
更新 simulation/simulation.test.ts:

  "MC simulation: same seed produces same result"
  - 用 seed=42 跑 50 次 MC
  - 再用 seed=42 跑 50 次
  - kpiDistributions 的 mean 完全相同

  "MC simulation: different seeds produce similar but not identical means"
  - 用 seed=42 和 seed=99 各跑 100 次
  - mean 差距 < 10%，但不完全相等

  "MC simulation: std > 0 when prediction has uncertainty"
  - 注册一个 std=10000 的 heuristic 预测器
  - 跑 100 次 MC
  - kpiDistributions 的 std > 0（结果有分布，不是单一值）

  "MC simulation: std ≈ 0 when all predictions are deterministic"
  - 注册 std=0 的预测器
  - 跑 100 次 MC
  - kpiDistributions 的 std < 1（浮点误差范围）

  "MC simulation: early stopping when converged"
  - 注册 std=0 的预测器
  - 设 convergenceThreshold=0.05, minRuns=10
  - 验证 result.monteCarloRuns < config.runs（提前停了）

  "MC simulation: per-run results preserved when keepPerRunResults=true"
  - 设 keepPerRunResults=true, runs=10
  - 验证 perRunResults.length === 10
  - 每条包含所有 KPI 的值

  "backward compatibility: runs=1 no prediction gives deterministic result"
  - 用 runs=1, 无 predictionEngine
  - 结果与旧版 simulateStrategy 一致
```

---

### Task 1.3: 更新 comparator 使用分布排序

**修改文件**: `simulation/comparator.ts`

**变更**:
- `compareStrategies()` 的排序逻辑从单一 score 变为**分布感知**排序
- 排序依据：`adjustedScore = mean - riskPenalty * (mean - p5)`
  - riskPenalty 可配置（默认 0.3，风险厌恶型决策者调高）
- 输出的 `RankedStrategy` 新增 `kpiDistributions` 字段

**测试要求**:
```
  "risk-averse ranking may differ from pure mean ranking"
  - 策略A: mean=0.8, std=0.2 (高回报高风险)
  - 策略B: mean=0.7, std=0.05 (中回报低风险)
  - riskPenalty=0 → A 排第一
  - riskPenalty=1.0 → B 排第一（因为 A 的 p5 很差）
```

---

### Phase 1 总验收

**端到端场景测试** (新文件 `tests/e2e/legal-simulation.test.ts`):

```
场景：法律案件蒙特卡洛模拟

前置：
  - 创建 WorldGraph，添加 Case (amount=80000, evidence_strength=7.2)
  - 添加 Judge (pro_labor_rate=0.75)
  - 注册 HeuristicModel（强证据→高回收，弱证据→低回收，std=8000）
  - 注册 GradientBoostModel（训练 50 条样本）
  - 定义 ObjectiveSpec (recovery 60%, cost 25%, speed 15%)

执行：
  - 定义 3 个策略：和解/抗辩/异议（各有不同的 action 序列）
  - await compareStrategies(world, strategies, objective, engine, { runs: 200, seed: 42 })

验证：
  - 返回 3 个排名
  - 每个策略的 kpiDistributions 有 recovery/cost/speed 三个分布
  - 每个分布的 p5 < p25 < mean < p75 < p95（分布有宽度）
  - 排名第 1 的策略 mean 最高（或 risk-adjusted 最高）
  - 和解策略的 speed 分布明显优于抗辩策略
  - monteCarloRuns >= 30（至少跑了这么多次）
  - 原始 world 未被修改
```

- [ ] 端到端测试通过
- [ ] 性能：3 策略 × 200 MC × 3 步 < 10 秒
- [ ] git commit

---

## Phase 2: 事件溯源 + Copy-on-Write Fork

**目标**: WorldGraph 从直接修改 Map → 事件日志驱动；Fork 从 O(V) deep copy → O(1) 分支。
**预估**: ~2 天
**依赖**: Phase 0（但可与 Phase 1 并行开发，因为接口不变）
**可并行**: 2.1→2.2→2.3 必须顺序，2.4 可在 2.2 后独立做

---

### Task 2.1: EventLog 数据结构

**新增文件**: `packages/core/src/world-model/event-log.ts`

```typescript
export interface StateEvent {
  id: string;
  timestamp: number;
  entityId: EntityId;
  property: string;
  oldValue: PropertyValue;
  newValue: PropertyValue;
  cause: "direct" | "cascade" | "prediction" | "user_input";
  sourceEventId?: string;
  branchId: SnapshotId;
}

export class EventLog {
  private events: StateEvent[] = [];

  append(event: Omit<StateEvent, "id" | "timestamp">): StateEvent;
  getEventsAfter(timestamp: number): StateEvent[];
  getEventsForEntity(entityId: EntityId): StateEvent[];
  getEventsForBranch(branchId: SnapshotId): StateEvent[];
  get length(): number;
  toJSON(): StateEvent[];
  static fromJSON(events: StateEvent[]): EventLog;
}
```

**测试**: append/query/序列化/反序列化

---

### Task 2.2: WorldGraph 重构为事件驱动

**修改文件**: `world-model/graph.ts`

**核心变更**:
- 内部新增 `eventLog: EventLog`
- `updateProperty()` 不再直接修改 `entity.properties`，而是：
  1. Append 事件到 eventLog
  2. 更新内存缓存（保持读性能）
  3. Cascade 产生的变更同样 append 事件
- 新增 `getEventLog(): EventLog`
- 新增 `replayEvents(events: StateEvent[]): WorldGraph`（从事件重建）

**关键约束**: 公共 API（addEntity, getEntity, updateProperty, getNeighbors 等）签名不变，只改内部实现。所有现有测试不改就能通过。

**测试**:
```
  "event log should record all property changes"
  - 创建实体，修改属性 3 次
  - eventLog.length === 3
  - 每条事件有正确的 old/new 值

  "cascade should record cascade events with sourceEventId"
  - 设置 cascade 规则，修改属性触发级联
  - 级联事件的 cause === "cascade"
  - 级联事件的 sourceEventId 指向触发它的直接事件

  "replay should reproduce identical world state"
  - 创建完整世界（10 实体 + 5 关系 + 多次属性修改）
  - 导出 eventLog.toJSON()
  - 创建空 WorldGraph
  - replayEvents(events)
  - 两个世界的所有实体属性完全相同
```

---

### Task 2.3: Copy-on-Write Fork

**修改文件**: `world-model/fork.ts`, `world-model/graph.ts`

**实现策略**:
- WorldGraph 新增 `parentGraph?: WorldGraph` 和 `localEntities: Map<EntityId, Entity>`
- `forkGraph()` 不再 structuredClone，而是创建子 graph 指向父 graph
- 读取：先查 localEntities，没有 → 查 parentGraph（递归）
- 写入：第一次写时把该实体从 parent 深拷贝到 localEntities（COW）
- Entity/Relation 索引：子 graph 维护增量索引，合并父索引查询

**复杂度**:
- Fork: O(1)（只创建空的 localEntities map）
- 首次写: O(1)（拷贝单个实体）
- 读: O(depth)（遍历父链，通常 depth < 5）
- 内存: 只占修改过的实体的空间

**测试**:
```
  "COW fork: fork should be O(1) for large graphs"
  - 创建 1000 实体的图
  - 测量 forkGraph() 时间 < 1ms
  - 测量内存增量 < 原始图的 1%

  "COW fork: first write triggers copy"
  - fork 后修改一个实体的属性
  - 该实体在 fork 的 localEntities 中出现
  - 其他 999 个实体不在 localEntities 中

  "COW fork: all existing fork tests still pass"
  - 运行所有 fork.test.ts 测试（接口不变）
```

---

### Task 2.4: 时间旅行

**修改文件**: `world-model/graph.ts`

```typescript
  /** 返回指定时间戳的只读世界视图 */
  at(timestamp: number): ReadonlyWorldView;
```

**实现**: replay eventLog 到指定时间戳，返回只读投影。

**测试**:
```
  "time travel should show historical state"
  - t0: entity.score = 10
  - t1: entity.score = 20
  - t2: entity.score = 30
  - graph.at(t1).getEntity(id).properties.score === 20
```

---

### Phase 2 总验收

- [ ] 所有 Phase 0/1 的测试不改逻辑仍全绿（接口兼容）
- [ ] Fork 1000 实体图 10 次，内存 < 1.5 倍原始
- [ ] 事件日志可导出 JSON 并 replay 为完全相同的世界
- [ ] 时间旅行测试通过
- [ ] git commit

---

## Phase 3: 对手建模 + 领域知识包

**目标**: 实现 AdversaryModel + 法律领域包，让系统能跑真实法律场景。
**预估**: ~2 天
**依赖**: Phase 1（蒙特卡洛需要对手反应的随机采样）

---

### Task 3.1: AdversaryModel

**新增文件**: `packages/core/src/prediction/models/adversary.ts`

```typescript
export interface AdversaryProfile {
  entityId: EntityId;
  historicalBehavior: Array<{
    situation: string;
    response: string;
    frequency: number;
  }>;
}

export class AdversaryModel implements PredictionModel {
  readonly type = "adversary";

  constructor(
    id: string,
    targetProperty: string,
    private profile: AdversaryProfile,
    private llmClient?: LLMClient,
    accuracy?: number,
  );

  /** 预测对手面对某个行动时的反应 */
  async predict(context: PredictionContext): Promise<ProbabilityDistribution>;

  /** 生成对手可能的具体行动 */
  async predictAction(
    world: WorldGraph,
    ourAction: Action,
  ): Promise<{ action: Action; probability: number }[]>;
}
```

**两种预测路径**:
1. 如果有足够历史数据 → 基于条件概率（统计方法）
2. 如果数据不足 → 用 LLM 推理对手反应（提供对手 profile + 我方行动）

**集成到 simulator**:
- `simulateStrategy()` 每步 action 后：
  1. 调用 `adversaryModel.predictAction(fork, action)`
  2. 从返回的行动概率分布中采样一个对手行动
  3. 在 fork 中执行对手行动
  4. cascade 传播

---

### Task 3.2: 法律领域包

**新增目录**: `packages/domains/legal/`

**文件结构**:
```
packages/domains/legal/
├── package.json              # @dcas/legal
├── src/
│   ├── ontology.ts           # 实体类型定义
│   ├── seed-data.ts          # 预加载的法条和仲裁委数据
│   ├── cascade-rules.ts      # 法律领域级联规则
│   ├── predictions.ts        # HeuristicModel 规则集
│   ├── strategies.ts         # 策略模板（和解/抗辩/异议/分步）
│   ├── features.ts           # GradientBoost 特征提取器
│   ├── adversary.ts          # 对方律师行为模型
│   └── index.ts              # barrel export
└── tests/
    └── legal.test.ts
```

**ontology.ts 定义的实体类型**:
```typescript
// Case, Party, Judge/Arbitrator, Statute, Evidence, Precedent, Budget
// 每种实体的必需属性和可选属性
// 关系类型: plaintiff_in, defendant_in, decided_by, cites, has_evidence, has_budget
```

**seed-data.ts 预加载数据**:
```typescript
// 劳动合同法关键条文（第82条双倍工资、第87条违法解除赔偿等）
// 常用仲裁委信息
// 至少 10 条模拟判例数据（用于训练 GradientBoost）
```

**cascade-rules.ts**:
```typescript
// 规则1: 当 Case.assigned_judge 变化时 → 重算 Case.base_win_probability
// 规则2: 当 Case.base_win_probability 变化时 → 重算 Case.expected_award
// 规则3: 当 Case.strategy 变化时 → 重算 Budget.allocated
// 规则4: 当 Case.expected_award 变化时 → 重算 Case.risk_level
```

---

### Task 3.3: LLM 实体抽取

**新增文件**: `packages/core/src/llm/entity-extractor.ts`

```typescript
export async function extractEntitiesFromText(
  client: LLMClient,
  text: string,
  ontologyHints: string[],  // 提示 LLM 可能的实体类型
): Promise<{
  entities: Array<{ type: string; properties: Record<string, any> }>;
  relations: Array<{ type: string; sourceHint: string; targetHint: string }>;
}>;
```

**与 seed data 关联**: 抽取出的法条引用（如"劳动合同法第82条"）自动匹配 seed-data 中的 Statute 节点。

---

### Phase 3 总验收

**端到端场景** (新文件 `tests/e2e/legal-full.test.ts`):

```
输入: 一段法律案件描述（硬编码的测试文本，不调真实 LLM）
→ mock LLM 抽取返回结构化实体
→ 写入 WorldGraph（使用 legal ontology）
→ 自动关联 seed-data 中的法条
→ cascade 更新胜诉率 + 预算
→ 生成 3 个策略（使用 legal strategies 模板）
→ 蒙特卡洛模拟（含对手建模，mock LLM 对手反应）
→ 排序推荐

验证:
- 图谱包含 Case + Party×2 + Judge + Statute×2 + Budget
- cascade 正确触发（法官分配 → 胜诉率更新）
- 3 个策略的 MC 分布合理（和解 std < 抗辩 std）
- 对手行为在不同 MC run 中有变化
```

- [ ] 端到端测试通过
- [ ] 法律领域包可独立 import (`import { createLegalWorld } from "@dcas/legal"`)
- [ ] git commit

---

## Phase 4: 前端 Demo + 持久化 + 部署

**目标**: 可视化、可交互、可分享。
**预估**: ~2-3 天
**依赖**: Phase 1 + 3

---

### Task 4.1: Demo 1 — 法律策略模拟器前端

**目录**: `demos/legal-strategy/` (Vite + React + TypeScript)

**页面结构**:
```
┌─────────────────────────────────────────────────────┐
│  DCAS 法律策略模拟器                                  │
├─────────────┬───────────────────────────────────────┤
│ 案件输入     │  World Model 可视化 (D3 力导向图)      │
│ ─────────── │                                       │
│ 案件类型 ▼  │  [Case]──decided_by──>[Judge]         │
│ 标的额 ___  │    │                                   │
│ 证据强度 ━━━│    ├──cites──>[Statute]                │
│ 法官选择 ▼  │    └──has_budget──>[Budget]            │
│             │                                       │
│ [开始模拟]   │                                       │
├─────────────┴───────────────────────────────────────┤
│ 策略对比（蒙特卡洛结果）                               │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│ │ 和解 #1   │ │ 抗辩 #2   │ │ 异议 #3   │             │
│ │ Score:0.81│ │ Score:0.62│ │ Score:0.55│             │
│ │ [箱线图]  │ │ [箱线图]  │ │ [箱线图]  │              │
│ │ [雷达图]  │ │ [雷达图]  │ │ [雷达图]  │              │
│ └──────────┘ └──────────┘ └──────────┘              │
├─────────────────────────────────────────────────────┤
│ 推理链: "基于 200 次蒙特卡洛模拟..."                   │
└─────────────────────────────────────────────────────┘
```

**技术选型**:
- Vite + React 18 + TypeScript
- D3.js 或 @antv/g6 做图谱可视化
- recharts 或 @antv/g2 做箱线图/雷达图
- Web Worker 后台运行模拟（不阻塞 UI）

**交互**:
- 拖动"证据强度"滑块 → 重新模拟（debounce 500ms）→ 策略排名实时更新
- 切换法官 → cascade 自动更新 → 重新模拟 → 可能策略排名完全改变
- 点击策略卡片 → 展开推理链和 MC 分布直方图

---

### Task 4.2: 持久化层

**新文件**: `packages/core/src/storage/sqlite-adapter.ts`
**依赖**: `better-sqlite3`

实现 DecisionStore 和 PatternMemory 的 SQLite 持久化。
接口与内存版完全相同，构造时选择 backend。

---

### Task 4.3: GitHub 部署

- GitHub Actions CI：build → test → deploy
- Demo 构建为静态站点部署到 GitHub Pages
- 推送到 `giao-123-sun/dcas`

---

### Phase 4 验收

> 分享一个 URL，任何人打开可以：
> 1. 输入案件类型和参数
> 2. 看到实体关系图（力导向布局）
> 3. 点"开始模拟"→ 几秒后看到三种策略的蒙特卡洛分布对比
> 4. 拖动"证据强度"滑块，策略排名实时变化
> 5. 查看完整推理链

---

## Phase 5: 生产级增强

### Task 5.1: MetaClaw 真实对接
### Task 5.2: HTTP API 服务
### Task 5.3: 内容运营领域包 + Demo 2
### Task 5.4: 投资组合领域包 + Demo 3
### Task 5.5: Ontology 自动发现（LLM 辅助）

（Phase 5 细节在前面的 Phase 完成后再展开，避免过早规划变化太大的部分）

---

## 附录 A: 关键文件索引

| 文件路径 | 功能 | Phase 0 改 | Phase 1 改 | Phase 2 改 |
|---------|------|-----------|-----------|-----------|
| prediction/types.ts | 预测接口 | ✅ async | | |
| prediction/engine.ts | 模型管理 | ✅ async | | |
| prediction/models/*.ts | 4种模型 | ✅ async + type fix | | |
| simulation/simulator.ts | 模拟核心 | ✅ async | ✅ MC重写 | |
| simulation/comparator.ts | 策略排序 | ✅ async | ✅ 分布排序 | |
| simulation/types.ts | 类型定义 | | ✅ MC类型 | |
| world-model/graph.ts | 图数据库 | ✅ 去!断言 | | ✅ 事件驱动 |
| world-model/fork.ts | 世界分叉 | | | ✅ CoW |
| world-model/cascade.ts | 级联传播 | ✅ 改分隔符 | | |
| loop/controller.ts | 决策循环 | ✅ async+timer | | |
| 新: config.ts | 配置管理 | ✅ 新建 | | |
| 新: prediction/sampler.ts | MC采样器 | | ✅ 新建 | |
| 新: world-model/event-log.ts | 事件日志 | | | ✅ 新建 |
| 新: prediction/models/adversary.ts | 对手建模 | | | | Phase 3 |
| 新: packages/domains/legal/ | 法律领域 | | | | Phase 3 |
| 新: demos/legal-strategy/ | 前端Demo | | | | Phase 4 |

## 附录 B: 测试矩阵

| Phase | 新增测试数（预估） | 累计测试 | 新增测试文件 |
|-------|----------------|---------|------------|
| 0 | ~15 | ~115 | config.test.ts |
| 1 | ~15 | ~130 | sampler.test.ts, e2e/legal-simulation.test.ts |
| 2 | ~12 | ~142 | event-log.test.ts |
| 3 | ~15 | ~157 | adversary.test.ts, legal.test.ts, e2e/legal-full.test.ts |
| 4 | ~5 | ~162 | sqlite.test.ts |

## 附录 C: 竞争定位检查点

| Phase 完成后 | DCAS 具备的差异化能力 | 对比竞品 |
|------------|-------------------|---------|
| Phase 1 | 蒙特卡洛概率模拟 | 超越纯 LLM Agent（大多只有推理无模拟） |
| Phase 2 | 可 fork 的图世界模型 | **开源唯一**（Graphiti 不能 fork，Palantir 闭源） |
| Phase 3 | 对手建模 + 领域知识 | 超越通用 Agent 框架 |
| Phase 4 | 可视化交互 Demo | 可展示、可分享、可吸引关注 |
| Phase 5 | 完整闭环决策服务 | 可部署、可商用 |
