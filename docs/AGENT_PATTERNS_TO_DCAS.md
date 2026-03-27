# Agent 框架核心机制 → DCAS 六层映射

## 研究的 9 个框架

| 框架 | 核心机制 | 关键创新 |
|------|---------|---------|
| AI Scientist v2 | 树搜索 + 节点分类（buggy/non-buggy）+ 并行探索 | 多阶段渐进精炼 |
| Voyager | 技能库（向量索引代码）+ 自动课程 | 终身学习无需微调 |
| LATS | MCTS + LLM 价值函数 + 自反思 | 系统化探索 + 语义梯度 |
| Reflexion | 语言反馈 + 情景记忆缓冲区 | 语言作为梯度信号 |
| ADAS | 元智能体编程新智能体 + 档案库 | 图灵完备搜索空间 |
| OpenDevin | 事件流 + 步进循环 | 通用智能体纯靠上下文学习 |
| Aider | lint/test 紧反馈 + git | 不可变评估防作弊 |
| Karpathy AutoResearch | 假设→修改→评估 + git 棘轮 | 范围限制 + 单调进步 |
| AutoRA | 理论家+实验家双智能体 | 不确定性驱动实验设计 |

---

## 映射到 DCAS 六层

### L1 World Model — 吸收 Voyager 的技能库 + OpenDevin 的事件流

**当前状态**: 有 EventLog 但只记录属性变更，不记录"做过什么决策、效果如何"

**吸收什么**:

1. **Voyager 技能库** → DCAS 策略库
   - 当前：策略是预定义模板，用完即弃
   - 改为：成功的策略自动存入**策略库**，用 embedding 索引
   - 下次遇到类似场景，自动检索 top-K 相关策略作为候选
   - 具体实现：`StrategyLibrary` 在 World Model 中作为特殊实体

```
策略库条目:
{
  embedding: vector,          // 场景描述的 embedding
  strategy: Strategy,         // 完整策略定义
  context: WorldSnapshot,     // 当时的世界状态摘要
  score: number,              // 执行效果
  uses: number,               // 被复用次数
  lastUsed: timestamp
}
```

2. **OpenDevin 事件流** → DCAS 决策流
   - 当前 EventLog 只记录属性变更
   - 扩展为记录完整决策事件：触发→策略生成→模拟→选择→执行→反馈
   - 每个事件带类型标签：`decision_triggered`, `strategy_generated`, `simulation_run`, `strategy_chosen`, `outcome_recorded`

### L2 Objective Function — 吸收 AutoRA 的不确定性驱动

**当前状态**: KPI 定义是静态的，人工设定权重

**吸收什么**:

1. **AutoRA 的不确定性驱动** → KPI 权重自适应
   - 当前：权重固定（recovery=0.6, cost=0.25, speed=0.15）
   - 改为：哪个 KPI 的预测不确定性最高 → 自动提高其探索权重
   - 类似 AutoRA 的"模型不确定性决定下一步实验方向"

```typescript
function adaptWeights(kpis: KPI[], predictions: Map<string, ProbabilityDistribution>): KPI[] {
  // 不确定性越高的 KPI → 权重略微提高 → 引导系统探索这个方向
  for (const kpi of kpis) {
    const pred = predictions.get(kpi.id);
    if (pred && pred.std > threshold) {
      kpi.weight *= (1 + uncertaintyBonus);  // 不确定 → 多探索
    }
  }
  // 重归一化
  normalize(kpis);
}
```

### L3 Prediction Engine — 吸收 Reflexion 的语言反馈 + LATS 的双价值函数

**当前状态**: 4 种模型 ensemble，但学习信号只有数值偏差

**吸收什么**:

1. **Reflexion 的语言反馈** → 预测失败的语义分析
   - 当前：预测偏差 > 15% → `recalibrate`（调数字）
   - 新增：LLM 分析偏差原因 → 生成语言反馈 → 存入情景记忆
   - 下次预测相似场景时，检索相关反馈作为上下文

```typescript
// 当前
if (deviation > 0.15) predictionEngine.recalibrate(kpiId, deviation);

// 新增
if (deviation > 0.15) {
  const reflection = await llm.generate(
    `Predicted ${predicted} but actual was ${actual} for ${context}.
     What went wrong? What should we check next time?`
  );
  reflectionMemory.store({ context, reflection, deviation });
}

// 预测时
const pastReflections = reflectionMemory.retrieveSimilar(currentContext, 3);
const enrichedPrediction = await predictionEngine.predictWithContext(
  world, property, pastReflections
);
```

2. **LATS 的双价值函数** → 预测置信度的双重验证
   - 当前：单一 confidence 分数
   - 新增：LLM 自评估 + 多次采样一致性 → 双重置信度
   - 如果两个置信度分歧大 → 标记为"不可靠预测"

### L4 Simulation & Strategy — 吸收 AI Scientist 的树搜索 + Karpathy 的 git 棘轮

**当前状态**: 生成 N 个策略 → 蒙特卡洛模拟 → 排序

**吸收什么**:

1. **AI Scientist v2 的分阶段树搜索** → 策略渐进精炼

```
当前：
  [策略A, 策略B, 策略C] → 模拟 → 排序 → 选最优

改为（三阶段）：
  Stage 1: 生成 N 个策略 → 分类为 feasible/infeasible
  Stage 2: 取 feasible → 参数微调（每个策略生成 K 个变体）
  Stage 3: 从 Stage 2 选最优 → 精细模拟（更多 MC runs）

  每个 stage 并行执行，逐步收窄搜索空间
```

2. **Karpathy AutoResearch 的 git 棘轮** → 策略只进不退

```typescript
// 当前：每次决策独立，不记住之前的最优策略
// 改为：维护一个 "strategy baseline"
class StrategyBaseline {
  private bestStrategy: Strategy | null = null;
  private bestScore: number = -Infinity;

  propose(candidate: Strategy, score: number): "accept" | "reject" {
    if (score > this.bestScore) {
      this.bestStrategy = candidate;
      this.bestScore = score;
      return "accept";  // commit
    }
    return "reject";  // revert
  }
}
```

3. **Aider 的 lint/test 紧反馈** → 策略执行后立即验证

```
当前：策略执行 → 等反馈（可能很久）
改为：策略执行后立即跑"策略 lint"（约束检查 + 可行性验证）
  → 如果违反约束 → 立即回滚
  → 如果通过 → 等待最终反馈
```

### L5 Memory & Learning — 吸收 Reflexion 的情景记忆 + ADAS 的档案库

**当前状态**: DecisionStore + PatternMemory，但记忆是被动的

**吸收什么**:

1. **Reflexion 的情景记忆** → 主动检索式学习

```
当前：
  记录决策 → 事后分析偏差 → 提取模式

改为：
  做决策前 → 检索最相似的过去决策 → 看它的反思
  → "上次类似场景预测偏高20%，因为没考虑对方律师的风格"
  → 将反思注入当前预测/策略生成的上下文
```

2. **ADAS 的发现档案** → DCAS 的策略进化档案

```typescript
interface StrategyArchive {
  // 不只存策略，存"策略的演变过程"
  entries: Array<{
    strategy: Strategy;
    score: number;
    parentStrategyId?: string;  // 从哪个策略演变来的
    mutation: string;           // 做了什么修改
    context: WorldSnapshot;     // 在什么情况下
  }>;

  // 元智能体：基于档案生成新策略
  async evolveNew(context: WorldModel): Promise<Strategy> {
    const topStrategies = this.getTop(5);
    const prompt = `Based on these proven strategies: ${topStrategies}
                    Current situation: ${context}
                    Generate a NEW strategy that combines the best elements.`;
    return llm.generate(prompt);
  }
}
```

### L6 Decision Loop — 吸收 AutoRA 的双智能体 + AI Scientist 的自动课程

**当前状态**: 监控 KPI → 触发决策流程

**吸收什么**:

1. **AutoRA 的理论家+实验家** → DCAS 的"分析师+执行者"双循环

```
当前：
  单循环：监控 → 生成策略 → 模拟 → 推荐

改为双循环：
  外循环（分析师）：分析预测模型的弱点 → 设计"探索性决策"
    → 目的不是最优结果，而是收集信息来改进模型
  内循环（执行者）：用当前最优策略执行
    → 目的是最大化当前 KPI

  两个循环的资源分配：exploitation(80%) + exploration(20%)
```

2. **Voyager 的自动课程** → 自动识别"下一个值得探索的方向"

```typescript
async function generateExplorationTarget(world: WorldModel, memory: PatternMemory): string {
  // 找到世界模型中不确定性最高的区域
  const uncertainEntities = findHighUncertaintyEntities(world, predictionEngine);

  // 找到模式记忆中置信度最低的模式
  const weakPatterns = memory.getAll().filter(p => p.confidence < 0.5);

  // LLM 综合判断下一步该探索什么
  return llm.generate(`
    High uncertainty areas: ${uncertainEntities}
    Weak patterns: ${weakPatterns}
    What should we investigate next to most improve our decision quality?
  `);
}
```

---

## 优先级排序（投入产出比）

| 优先级 | 改动 | 来源框架 | DCAS 层 | 工程量 | 预期收益 |
|--------|------|---------|---------|--------|---------|
| ★★★ | 情景记忆（决策前检索过去反思） | Reflexion | L5→L3,L4 | 中 | 预测精度+策略质量 |
| ★★★ | 策略库（embedding 索引+检索） | Voyager | L1,L4 | 中 | 策略复用，避免重复探索 |
| ★★★ | Git 棘轮（策略只进不退） | Karpathy | L4 | 小 | 防止退化 |
| ★★☆ | 三阶段树搜索 | AI Scientist v2 | L4 | 大 | 更好的策略空间探索 |
| ★★☆ | 语言反馈存储 | Reflexion | L5 | 中 | 从失败中学到可迁移的知识 |
| ★★☆ | 不确定性驱动权重 | AutoRA | L2 | 小 | 自适应优化方向 |
| ★☆☆ | 双循环（探索+利用） | AutoRA | L6 | 大 | 主动学习 |
| ★☆☆ | 策略进化档案 | ADAS | L5 | 大 | 长期策略演化 |

---

## 第一步实现建议

**Phase 7: Agent 模式融合**

```
7.1 Reflexion 情景记忆 (L5)
    - ReflectionMemory: 存储 {context, prediction, outcome, reflection}
    - 决策前检索 top-3 相关反思注入上下文
    - 测试：同域 train/test 的 lift 是否提升

7.2 Voyager 策略库 (L1+L4)
    - StrategyLibrary: embedding 索引 + 策略代码
    - compareStrategies 前先检索历史成功策略
    - 测试：重复场景下的策略质量是否提升

7.3 Git 棘轮 (L4)
    - StrategyBaseline: 只 commit 更好的策略
    - 防止策略退化（类似 CritiqueLock 的思路）
    - 测试：多轮决策的 score 曲线是否单调

这三个改动互相独立，可以并行开发。
```

---

*Document Version: 1.0*
*Last Updated: 2026-03-25*
