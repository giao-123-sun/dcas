# Self-Model 开发计划

## 一、为什么这是优先级最高的下一步

当前 DCAS 生成策略时，不知道"我"能不能执行这个策略。就像让一个不会游泳的人制定"游过英吉利海峡"的计划——策略可能在纸面上最优，但执行者根本做不到。

**Self-Model 解决的核心问题**：策略的可行性校验。

没有 Self-Model 的系统会：
- 生成自己执行不了的策略
- 低估完成任务的成本（不知道团队已经满负荷）
- 忽略资源约束（不知道只有2个律师可用）
- 不知道什么时候该求助（不知道自己缺哪个能力）

## 二、设计原则

1. **Self-Model 是 World Model 中的特殊实体**，不是新的层。它和 Case、Judge 一样是图谱中的节点。
2. **Core 定义接口和机制**，领域包填充具体内容（律所的 Self 和内容运营者的 Self 不同）。
3. **向后兼容**：没有 Self-Model 的情况下，系统行为和现在完全一样（可行性检查跳过）。
4. **渐进增强**：Self-Model 可以从最简单的（几个属性）到最完整的（五个维度全覆盖），每一步都能提供价值。

## 三、开发任务分解

### Phase S.1: Core Self-Model 框架（核心引擎层）

**文件**: `packages/core/src/self-model/`

#### Task S.1.1: Self-Model 类型定义

**新建**: `packages/core/src/self-model/types.ts`

```typescript
// Self-Model 五个维度的类型定义

export interface SelfIdentity {
  entityType: string;        // "law_firm" | "content_creator" | "fund_manager"
  name: string;
  specializations: string[];
  jurisdiction?: string[];
}

export interface SelfCapability {
  skillId: string;
  domain: string;            // 哪个领域
  taskType: string;          // 什么任务
  proficiency: number;       // 0-1 能力分
  experienceCount: number;   // 经验次数
  lastPracticed?: number;    // 上次实践（时间戳）
}

export interface SelfResource {
  resourceType: "time" | "money" | "personnel" | "information" | "tool";
  name: string;
  available: number;         // 当前可用量
  capacity: number;          // 总容量
  unit: string;              // "hours" | "yuan" | "people" | ...
}

export interface SelfState {
  memberId: string;
  currentLoad: number;       // 当前负荷
  maxLoad: number;           // 最大负荷
  fatigueLevel: number;      // 0-1 疲劳度
  performanceFactor: number; // 相对于基线的表现系数
}

export interface SelfBoundary {
  boundaryType: "ethical" | "legal" | "capability" | "resource";
  description: string;
  isAbsolute: boolean;       // true = 绝对不可违反
  check: (world: WorldGraph) => boolean;  // 是否违反
}

// 可行性检查结果
export interface FeasibilityResult {
  feasible: boolean;
  score: number;             // 0-1 可行性分数
  issues: FeasibilityIssue[];
  mitigations: Mitigation[];
}

export interface FeasibilityIssue {
  type: "capability_gap" | "resource_shortage" | "time_constraint" | "boundary_violation" | "overload";
  severity: "blocker" | "high" | "medium" | "low";
  description: string;
  affectedAction?: string;   // 哪个 action 有问题
}

export interface Mitigation {
  type: "outsource" | "upskill" | "adjust_strategy" | "negotiate_deadline" | "add_resource";
  description: string;
  cost: number;
  timeImpact: number;        // 增加的天数
}
```

**验收**: 类型编译通过，所有接口导出。

#### Task S.1.2: Self-Model 管理器

**新建**: `packages/core/src/self-model/self-model.ts`

```typescript
// SelfModel 类: 从 WorldGraph 中读写 Self 相关实体

export class SelfModel {
  constructor(private world: WorldGraph) {}

  // 读取
  getSelfEntity(): Entity | undefined;
  getTeamMembers(): Entity[];
  getCapabilities(): SelfCapability[];
  getResources(): SelfResource[];
  getMemberState(memberId: string): SelfState | undefined;
  getBoundaries(): SelfBoundary[];

  // 能力查询
  hasCapability(domain: string, taskType: string): boolean;
  getBestMemberForTask(domain: string, taskType: string): Entity | undefined;
  getCapabilityGaps(requiredSkills: string[]): string[];

  // 资源查询
  getAvailableHours(timeframe: "week" | "month"): number;
  getUtilizationRate(): number;
  isOverloaded(): boolean;

  // 写入（更新状态）
  updateMemberLoad(memberId: string, newLoad: number): void;
  updateMemberFatigue(memberId: string, newFatigue: number): void;
  recordSkillUsage(memberId: string, skillId: string, outcome: "success" | "failure"): void;
}
```

**验收**: 能从空 WorldGraph 中初始化，team member 增删改查工作。

#### Task S.1.3: 可行性检查器

**新建**: `packages/core/src/self-model/feasibility.ts`

```typescript
// 对一个 Strategy 进行可行性检查

export function checkFeasibility(
  strategy: Strategy,
  selfModel: SelfModel,
  world: WorldGraph,
  config?: DCASConfig,
): FeasibilityResult;

// 检查步骤:
// 1. 能力检查: 每个 action 需要什么能力？团队有没有？
// 2. 资源检查: 估算总工时，对比可用时间
// 3. 财务检查: 估算成本，对比预算
// 4. 时间线检查: 估算周期，对比 deadline
// 5. 边界检查: 任何绝对边界被违反？
// 6. 负荷检查: 执行团队是否已过载？

// 自动生成缓解方案
export function suggestMitigations(
  issues: FeasibilityIssue[],
  selfModel: SelfModel,
): Mitigation[];
```

**验收**:
- 给一个超出能力范围的策略 → 返回 `feasible: false` + capability_gap issue
- 给一个资源不足的策略 → 返回 `feasible: true, score: 0.6` + resource_shortage issue + mitigation
- 给一个正常策略 → 返回 `feasible: true, score: 0.95`

#### Task S.1.4: 集成到模拟器

**修改**: `packages/core/src/simulation/simulator.ts`

```typescript
// simulateStrategy 新增可选参数 selfModel
async function simulateStrategy(
  world: WorldGraph,
  strategy: Strategy,
  objective: ObjectiveSpec,
  predictionEngine?: PredictionEngine,
  predictProperties?: string[],
  mcConfig?: MonteCarloConfig,
  config?: DCASConfig,
  selfModel?: SelfModel,           // ← 新增
): Promise<SimulationResult> {

  // 1. 可行性检查（如果有 SelfModel）
  let feasibility: FeasibilityResult | undefined;
  if (selfModel) {
    feasibility = checkFeasibility(strategy, selfModel, world, config);
    // 如果完全不可行且有绝对边界违反 → 跳过模拟
    if (!feasibility.feasible && feasibility.issues.some(i => i.severity === "blocker")) {
      return buildInfeasibleResult(strategy, feasibility);
    }
  }

  // 2. 蒙特卡洛模拟中，执行质量受 Self 状态影响
  // 在 MC run 内部，action 效果乘以 qualityFactor
  // qualityFactor = proficiency × (1 - fatiguePenalty) × moraleBonus

  // 3. 结果中附带可行性信息
  result.feasibility = feasibility;
}
```

**SimulationResult 新增字段**:
```typescript
interface SimulationResult {
  ...existing,
  feasibility?: FeasibilityResult;
}
```

**向后兼容**: selfModel 参数可选。不传就跳过所有可行性检查，行为和现在完全一样。

**验收**:
- 所有 171 个现有测试不改就通过
- 新增测试: 传入 SelfModel 后，不可行策略得到 `feasibility.feasible = false`
- 新增测试: 传入 SelfModel 后，MC 模拟中 action 效果受 qualityFactor 影响

#### Task S.1.5: 集成到策略排序

**修改**: `packages/core/src/simulation/comparator.ts`

```typescript
// compareStrategies 中，不可行策略排在最后（类似硬约束违反）

// 排序逻辑扩展:
// 1. blocker 级不可行 → 排最后，score = 0
// 2. 可行但有 issues → score 打折 (score *= feasibility.score)
// 3. 推理链中包含可行性分析
```

**RankedStrategy 新增字段**:
```typescript
interface RankedStrategy {
  ...existing,
  feasibility?: FeasibilityResult;
}
```

#### Task S.1.6: 集成到预测引擎

**修改**: `packages/core/src/prediction/types.ts`

```typescript
// PredictionContext 扩展
interface PredictionContext {
  world: WorldGraph;
  action?: PredictionAction;
  targetProperty: string;
  targetEntityType?: string;
  selfModel?: SelfModel;      // ← 新增
}
```

Heuristic 和 ML 模型可以选择使用 selfModel 来提取额外特征（律师胜诉率、疲劳度等）。不使用也没关系（向后兼容）。

#### Task S.1.7: Self-Model 级联规则

**新建**: `packages/core/src/self-model/cascade-rules.ts`

```typescript
// 通用的 Self-Model 级联规则

export const selfCascadeRules: CascadeRule[] = [
  // 当团队成员可用时间变化 → 重算团队总可用时间
  {
    sourceType: "TeamMember",
    sourceProperty: "available_hours",
    relationTypes: ["member_of"],
    direction: "outgoing",  // TeamMember → Self
    maxDepth: 2,
    effect: (ctx) => {
      // 重算 Self 的总可用时间（需要查所有 member）
      // 简化版: 直接把变化量加减到 Self 上
      const delta = (ctx.newValue as number) - (ctx.oldValue as number);
      const currentTotal = (ctx.targetEntity.properties.total_available_hours as number) ?? 0;
      return { targetProperty: "total_available_hours", value: currentTotal + delta };
    },
  },

  // 当团队成员负荷变化 → 重算利用率
  {
    sourceType: "TeamMember",
    sourceProperty: "current_load",
    relationTypes: ["member_of"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => {
      const load = ctx.newValue as number;
      const maxLoad = (ctx.sourceEntity.properties.max_load as number) ?? 10;
      const utilization = load / maxLoad;
      // 如果任何成员超载 → Self 的状态变为 overloaded
      if (utilization > 0.9) {
        return { targetProperty: "workload_state", value: "overloaded" };
      }
      return undefined;
    },
  },
];
```

#### Task S.1.8: Barrel Export + Tests

**修改**: `packages/core/src/index.ts` — 导出所有 self-model 类型和函数

**新建**: `packages/core/tests/self-model/self-model.test.ts`

测试清单:
```
describe("SelfModel")
  ✓ should create self entity and team members
  ✓ should query capabilities
  ✓ should detect capability gaps
  ✓ should calculate utilization rate
  ✓ should detect overload state

describe("Feasibility Checker")
  ✓ should pass for strategies within capabilities
  ✓ should fail for strategies requiring unknown skills
  ✓ should warn for resource-constrained strategies
  ✓ should block for boundary-violating strategies
  ✓ should suggest mitigations for capability gaps
  ✓ should suggest mitigations for resource shortages

describe("Self-Model in Simulation")
  ✓ should not affect simulation when selfModel is undefined (backward compat)
  ✓ should mark infeasible strategies in simulation result
  ✓ should apply quality factor in MC simulation
  ✓ should rank infeasible strategies last in comparison

describe("Self-Model Cascade")
  ✓ should propagate member availability change to self total
  ✓ should detect overload when member load exceeds threshold
```

预计: ~17 新测试

---

### Phase S.2: 法律领域 Self-Model 实例化

**修改**: `packages/domains/legal/`

#### Task S.2.1: Legal Self-Model Seed Data

**新建**: `packages/domains/legal/src/self-model.ts`

```typescript
export function seedLegalSelfModel(world: WorldGraph) {
  // 律所
  const firm = world.addEntity("Self", {
    name: "示例律师事务所",
    type: "boutique_law_firm",
    specializations: ["labor_law", "employment_law"],
    jurisdiction: ["北京", "上海"],
    total_available_hours: 0,  // 由 cascade 自动计算
    workload_state: "optimal",
    utilization_rate: 0,
  });

  // 律师 1: 张律师（资深合伙人）
  const zhangLawyer = world.addEntity("TeamMember", {
    name: "张律师",
    role: "senior_partner",
    specialization: ["labor_dispute", "wrongful_termination"],
    years_experience: 12,
    current_load: 8,
    max_load: 12,
    available_hours: 15,
    hourly_rate: 800,
    proficiency_labor_dispute: 0.82,
    proficiency_negotiation: 0.88,
    proficiency_trial: 0.75,
    fatigue_level: 0.3,
    performance_factor: 1.0,
  });

  // 律师 2: 李律师（初级律师）
  const liLawyer = world.addEntity("TeamMember", {
    name: "李律师",
    role: "associate",
    specialization: ["labor_dispute", "contract_review"],
    years_experience: 3,
    current_load: 12,
    max_load: 15,
    available_hours: 8,
    hourly_rate: 300,
    proficiency_labor_dispute: 0.65,
    proficiency_negotiation: 0.55,
    proficiency_trial: 0.40,
    fatigue_level: 0.6,  // 负荷较高
    performance_factor: 0.9,
  });

  // 关系
  world.addRelation("member_of", zhangLawyer.id, firm.id);
  world.addRelation("member_of", liLawyer.id, firm.id);

  // 能力缺口
  const gap = world.addEntity("CapabilityGap", {
    area: "maritime_law",
    severity: "critical",
    mitigation: "可外包给海事法专业律所",
  });
  world.addRelation("lacks_capability", firm.id, gap.id);

  return { firm, zhangLawyer, liLawyer, gap };
}
```

#### Task S.2.2: Legal Feasibility Rules

**新建**: `packages/domains/legal/src/feasibility-rules.ts`

```typescript
// 法律领域特化的可行性规则

export const legalFeasibilityRules = {
  // 策略"全面抗辩"需要 trial 能力 ≥ 0.7
  "full_defense": {
    requiredSkills: [{ domain: "labor_dispute", taskType: "trial", minProficiency: 0.7 }],
    estimatedHours: 60,
    estimatedCost: (claimAmount: number) => claimAmount * 0.5,
  },
  // 策略"和解"需要 negotiation 能力 ≥ 0.5
  "settlement": {
    requiredSkills: [{ domain: "labor_dispute", taskType: "negotiation", minProficiency: 0.5 }],
    estimatedHours: 20,
    estimatedCost: (claimAmount: number) => claimAmount * 0.15,
  },
  // 策略"管辖权异议"需要 procedural 能力
  "jurisdiction": {
    requiredSkills: [{ domain: "labor_dispute", taskType: "procedural_motion", minProficiency: 0.6 }],
    estimatedHours: 30,
    estimatedCost: (claimAmount: number) => claimAmount * 0.3,
  },
};
```

#### Task S.2.3: 更新 Legal Tests

新增测试:
```
describe("Legal Self-Model")
  ✓ should create firm with team members
  ✓ should detect that firm lacks maritime law capability
  ✓ should identify best lawyer for negotiation (张律师, 0.88)
  ✓ should warn when assigning trial to 李律师 (proficiency 0.40 < 0.70)
  ✓ should cascade: 张律师请假 → firm.total_available_hours 减少 → case risk 上升
```

预计: ~5 新测试

---

### Phase S.3: 内容运营和投资领域的 Self-Model

**修改**: `packages/domains/content/` 和 `packages/domains/investment/`

为这两个领域各创建对应的 Self-Model seed data:

**内容运营**:
```
Self = 运营团队
TeamMember = 编辑、设计师、视频剪辑
Capabilities = 长文写作、短视频制作、数据分析、投放操作
Resources = 内容预算、创作者时间、工具订阅费
Boundaries = 品牌调性红线、法律合规、平台规则
```

**投资组合**:
```
Self = 基金/投资者
TeamMember = 基金经理、分析师、交易员
Capabilities = 宏观分析、量化建模、个股研究、衍生品交易
Resources = 管理规模(AUM)、现金、保证金额度
Boundaries = 合规限制、仓位限制、投资者协议约束
```

每个约 100-150 行 + 3-5 个测试。

---

## 四、依赖关系和执行顺序

```
S.1.1 类型定义
  ↓
S.1.2 SelfModel 管理器 ←── S.1.7 级联规则
  ↓
S.1.3 可行性检查器
  ↓
S.1.4 集成到模拟器 ←── S.1.5 集成到排序 ←── S.1.6 集成到预测
  ↓
S.1.8 导出 + 测试
  ↓
S.2 法律领域实例化 ──── S.3 内容+投资领域实例化（可并行）
```

**关键路径**: S.1.1 → S.1.2 → S.1.3 → S.1.4 → S.1.8

## 五、工程量预估

| Task | 新文件 | 修改文件 | 新代码行 | 新测试 |
|------|-------|---------|---------|-------|
| S.1.1 类型定义 | 1 | 0 | ~100 | 0 |
| S.1.2 SelfModel 类 | 1 | 0 | ~150 | 5 |
| S.1.3 可行性检查器 | 1 | 0 | ~200 | 5 |
| S.1.4 集成模拟器 | 0 | 2 | ~80 | 3 |
| S.1.5 集成排序 | 0 | 1 | ~30 | 2 |
| S.1.6 集成预测 | 0 | 1 | ~20 | 0 |
| S.1.7 级联规则 | 1 | 0 | ~50 | 2 |
| S.1.8 导出+测试 | 1 | 1 | ~30 | 0 |
| S.2 法律 Self | 2 | 1 | ~200 | 5 |
| S.3 内容+投资 Self | 4 | 2 | ~300 | 6 |
| **总计** | **11** | **8** | **~1,160** | **~28** |

预估总工时: S.1 约 3-4 小时, S.2+S.3 约 2 小时

## 六、验收标准

### S.1 Core 验收
- [ ] 所有 171 个现有测试不改仍通过（向后兼容）
- [ ] SelfModel 可从 WorldGraph 中 CRUD self/team 实体
- [ ] checkFeasibility() 正确识别能力缺口、资源不足、边界违反
- [ ] suggestMitigations() 对每种 issue 类型至少返回一个建议
- [ ] simulateStrategy(... selfModel) 中不可行策略得到正确标记
- [ ] compareStrategies() 中不可行策略排在最后
- [ ] MC 模拟中 qualityFactor 影响 action 效果（同一策略，有/无 SelfModel 结果不同）
- [ ] 级联传播: member 状态变化 → self 汇总更新

### S.2 法律领域验收
- [ ] seedLegalSelfModel() 创建律所 + 2名律师 + 1个能力缺口
- [ ] "全面抗辩"策略交给李律师时标记为 `severity: "high"`（trial 能力不足）
- [ ] "和解"策略交给张律师时标记为 `feasible: true, score > 0.9`
- [ ] 张律师请假 → firm 总可用时间下降 → 案件风险告警

### 全局验收
- [ ] 测试数量从 171 增长到 ~199
- [ ] `pnpm build && pnpm test` 全绿
- [ ] git push 到 GitHub

## 七、对 SCENARIOS.md 的影响

Self-Model 实际上解决了场景扩展分析中提到的两个问题：
1. **"Action = 属性赋值"假设** — Self-Model 的 Boundaries 和 Capabilities 为 Action Executor 抽象层打基础
2. **"不可逆动作标记"** — Self-Model 的 Boundaries 可以将不可逆 action 标记为需要确认

而且 Self-Model 是**所有新领域包的标准组成部分**。Domain Plugin 注册机制应该要求每个领域包提供 `selfModelSeed` 函数。
