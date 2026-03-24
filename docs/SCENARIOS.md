# DCAS 场景扩展分析

## 核心问题

DCAS 当前架构在法律/内容运营/投资组合三个领域验证了可行性。但这三个领域碰巧共享相似的决策模式（单次离散选择 + 事后评估）。扩展到其他领域时，哪些需要改核心引擎，哪些只需要新领域包？

---

## 一、当前架构的隐含假设

| # | 假设 | 当前实现 | 限制 |
|---|------|---------|------|
| A1 | 单次决策 | 选一个策略 → 执行 → 看结果 | 不支持连续多轮决策链 |
| A2 | 离散策略空间 | 从 N 个预定义方案里选 | 不支持连续参数优化 |
| A3 | 单一决策者 | 一个 DCAS 实例做一个决策 | 不支持多方博弈/团队协作 |
| A4 | 模拟期间世界静态 | Fork 后外部不变化 | 不支持实时/动态环境 |
| A5 | 同质时间尺度 | KPI 在单一时间点评估 | 不支持短期/长期 KPI 冲突 |
| A6 | Action = 属性赋值 | 策略步骤是 `set(entity, prop, value)` | 不支持外部 API 调用/物理操作 |
| A7 | 决策可逆 | Fork 里随便改，不影响现实 | 不区分可逆/不可逆动作 |

---

## 二、场景全景

### 第一类：现有架构直接支持（只需新领域包）

这些场景的决策模式与法律/内容/投资相同：从有限方案中选最优，事后评估。

| 场景 | 实体类型 | 策略模式 | KPI | 备注 |
|------|---------|---------|-----|------|
| **HR 招聘决策** | 候选人、岗位、团队、薪资包 | 选 offer 方案（高薪/股权/灵活） | 接受率、成本、团队匹配度 | 和法律案件结构几乎一样 |
| **项目管理优先级** | Feature、团队、Sprint、依赖 | 选排期方案（先做A还是B） | 交付速度、技术债务、用户价值 | 类似投资组合的资源分配 |
| **采购比价** | 供应商、物料、合同条款 | 选供应商方案 | 价格、质量、交期、风险 | 直接映射目标函数 |
| **保险理赔** | 案件、条款、证据、评估 | 赔付方案（全赔/部分/拒赔） | 赔付金额、客户满意度、合规 | 和法律领域高度相似 |
| **教育课程推荐** | 学生、课程、能力、目标 | 选课方案 | 匹配度、负担、就业率 | 简单目标函数优化 |

**开发成本**：每个场景约 1 个领域包（ontology + seed-data + strategies + predictions + objective），无需改核心引擎。大约 200-300 行代码。

---

### 第二类：需要扩展核心流程（中等改动）

这些场景的决策模式在某个维度上超出了当前假设，但不需要重新设计整个架构。

#### 2.1 连续多轮决策（打破假设 A1）

**场景举例**：
- **医疗诊疗**：检查 → 诊断 → 用药 → 观察 → 调整 → 再评估
- **客户关系管理**：首次接触 → 培育 → 成交尝试 → 跟进 → 升级/放弃
- **债务催收**：发函 → 电话 → 上门 → 法律途径 → 执行

**当前不支持的原因**：
`simulateStrategy()` 接受一个 Strategy（固定的 action 列表），一次性跑完。不支持"执行第一步后，根据结果动态决定第二步"。

**需要的改动**：

```
新增：Sequential Decision Tree（决策树模式）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前：Strategy = [action1, action2, action3]  （线性序列）

扩展为：Strategy = DecisionTree
  ├── Step 1: action1
  │   ├── 如果结果 > 阈值 → Step 2a: action2a
  │   │   ├── 如果... → Step 3a
  │   │   └── 如果... → Step 3b
  │   └── 如果结果 ≤ 阈值 → Step 2b: action2b
  │       └── ...
  └── 退出条件: 达到目标 或 超过 N 轮
```

**具体改动**：
- `simulation/types.ts`：Strategy 新增 `type: "sequential" | "tree"` 字段和 `decisionPoints` 结构
- `simulation/simulator.ts`：新增 `simulateDecisionTree()` — 在每个决策点上，fork 出所有分支，递归模拟
- 与蒙特卡洛结合：每个分支内部仍可跑 MC，但分支选择本身也是概率性的

**工程量**：中等（~500行新代码 + 测试）。不需要改 L1-L3 和 L5-L6。

---

#### 2.2 连续参数优化（打破假设 A2）

**场景举例**：
- **动态定价**：价格不是"方案A=99元 vs 方案B=129元"，而是"在 50-200 元区间内找最优价格"
- **广告预算分配**：在 5 个渠道之间分配 100 万预算，每个渠道 0-100%
- **配方优化**：调配成分比例（连续空间）

**当前不支持的原因**：
策略生成器（`generateStrategies()`）产出离散的策略列表。没有能力在连续参数空间中搜索。

**需要的改动**：

```
新增：Parametric Strategy + Bayesian Optimization
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前：[策略A, 策略B, 策略C]  →  模拟  →  选最优

扩展为：
  1. 定义参数空间：price ∈ [50, 200], budget_channel_1 ∈ [0, 1], ...
  2. 初始采样 N 组参数（拉丁超立方采样）
  3. 每组参数构造为一个 Strategy → 模拟
  4. 用 Bayesian Optimization（高斯过程代理模型）
     预测哪个参数区域可能更优
  5. 迭代：采样新参数 → 模拟 → 更新代理模型
  6. 收敛后输出最优参数组合
```

**具体改动**：
- 新增 `simulation/parametric-optimizer.ts`：参数空间定义 + 采样 + BO 迭代
- 新增 `prediction/models/gaussian-process.ts`（可选，或用现有 ensemble 近似）
- Strategy 类型扩展支持 `generatedBy: "parametric"`

**工程量**：大（~800行 + 需要 GP 或其他代理模型库）。但可以渐进实现——先用网格搜索，后升级为 BO。

---

#### 2.3 多时间尺度（打破假设 A5）

**场景举例**：
- **内容运营**的短期（本周互动率）vs 长期（6个月品牌调性）
- **投资**的日内波动 vs 年度收益
- **人才培养**的季度产出 vs 3年成长

**当前不支持的原因**：
ObjectiveFunction 的 KPI 全部在模拟结束时一次性评估。没有"T+7天评一次、T+30天再评一次"的概念。

**需要的改动**：

```
新增：Multi-Horizon KPI
━━━━━━━━━━━━━━━━━━━━━
当前：KPI.compute(world_at_end)

扩展为：
  KPI {
    horizon: "7d" | "30d" | "180d",
    compute: (world, timeStep) => number,
    discountRate?: number,  // 远期 KPI 打折
  }

  评估时：
    short_term_score = KPI_7d.compute(world_at_step7)
    medium_term_score = KPI_30d.compute(world_at_step30) * discount(30)
    long_term_score = KPI_180d.compute(world_at_step180) * discount(180)
    total = weighted_sum(short, medium, long)
```

**具体改动**：
- `objective/types.ts`：KPI 新增 `horizon` 和 `discountRate` 字段
- `simulation/simulator.ts`：模拟时在多个时间点评估 KPI，加权求和
- 对 MC 的影响：每次 run 需要模拟更多步（7步、30步、180步），计算量增大

**工程量**：中等（~300行）。向后兼容——没有 horizon 的 KPI 默认在最后评估。

---

#### 2.4 不可逆动作标记（打破假设 A7）

**场景举例**：
- **医疗**：手术不可逆，用药可能有副作用
- **合同**：签字后有法律约束力
- **资金**：转账不可撤回

**当前不支持的原因**：
所有 Action 被同等对待。模拟时可以自由尝试任何 action 而不区分后果严重程度。

**需要的改动**：

```
新增：Action 风险分级
━━━━━━━━━━━━━━━━━━━
Action {
  ...existing,
  reversibility: "reversible" | "costly_to_reverse" | "irreversible",
  requiresConfirmation?: boolean,
}

模拟器在遇到 irreversible action 时：
  - 如果是 autonomous 模式 → 自动降级为 recommend
  - 如果是 monitoring 模式 → 标记需要人类确认
  - 在推理链中高亮标注："⚠️ 不可逆操作"

风险评估：
  - 不可逆 action 的 worst-case 权重加大
  - 排序时 penalize 包含不可逆 action 的策略
```

**工程量**：小（~150行）。只改 types + simulator + controller。

---

### 第三类：需要重新设计架构（大改动）

这些场景从根本上挑战了当前的架构假设。

#### 3.1 实时/流式决策（打破假设 A4）

**场景举例**：
- **高频交易**：毫秒级决策，世界状态持续变化
- **自动驾驶**：实时传感器输入 → 实时决策
- **智能客服路由**：来电实时分配给最合适的客服

**为什么当前架构不行**：
DCAS 是批处理模式——"拍快照 → 模拟 → 推荐"。蒙特卡洛跑100次需要几秒。如果世界在你模拟的时候就变了，结果就过时了。

**需要的改动**：

```
新架构：Streaming Decision Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前：
  世界快照 → 批量模拟(秒级) → 推荐

改为：
  事件流 → 增量更新世界模型 →
  触发条件判断(ms级) →
  快速预测(缓存 + 预计算) →
  实时输出决策

关键技术：
  1. EventLog 变成流式（EventStream + 滑动窗口）
  2. 预测模型维护"热缓存"——只在输入变化时增量更新
  3. 策略预编译——把常见场景的最优策略预先算好，运行时查表
  4. MC 降级为"快速粗估"（10次 run 而非100次）
```

**工程量**：非常大。相当于新建一个 `@dcas/streaming` 引擎包，和现有批处理引擎并存。

**建议**：Phase 6+ 再考虑。当前先聚焦批处理场景。

---

#### 3.2 多智能体协作/博弈（打破假设 A3）

**场景举例**：
- **供应链**：采购、生产、物流各有自己的 DCAS 实例，需要协调
- **多方谈判**：甲方、乙方、调解人各有不同目标
- **团队决策**：CEO、CTO、CFO 各有不同 KPI 权重

**为什么当前架构不行**：
当前的 AdversaryModel 只是"我方视角预测对方行为"。不是真正的多智能体——没有为对方也跑一个完整的决策循环。

**需要的改动**：

```
新架构：Multi-DCAS Coordination
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
当前：
  Agent_A 有 DCAS_A，预测 Agent_B 的反应（AdversaryModel）

改为：
  Agent_A 有 DCAS_A（目标函数_A）
  Agent_B 有 DCAS_B（目标函数_B）

  协调层：
    1. DCAS_A 生成候选策略
    2. DCAS_B 生成候选策略
    3. 在共享世界模型上模拟 (策略_A × 策略_B) 的所有组合
    4. 找到纳什均衡 或 帕累托最优
    5. 如果是合作博弈 → 帕累托最优
       如果是对抗博弈 → 纳什均衡
       如果是部分合作 → Stackelberg 均衡
```

**工程量**：大。需要新增 `simulation/multi-agent.ts` + 博弈论求解器。

**渐进路径**：先增强 AdversaryModel（让对手也有完整的目标函数），再扩展为完整的多 DCAS。

---

#### 3.3 外部执行层（打破假设 A6）

**场景举例**：
- **自动化运营**：决策后自动调用 API（发邮件、调价格、投放广告）
- **RPA 集成**：决策后驱动机器人执行操作
- **IoT 控制**：决策后发送指令到物理设备

**为什么当前架构不行**：
当前的 Action 是 `{ entityId, property, value }`——只能修改世界模型里的属性。不能触发外部系统操作。

**需要的改动**：

```
新增：Action Executor Layer
━━━━━━━━━━━━━━━━━━━━━━━━━
当前：
  Action = { set property in WorldGraph }

扩展为：
  Action =
    | PropertyAction { entityId, property, value }  // 现有
    | APIAction { endpoint, method, payload, expectedResponse }
    | WebhookAction { url, payload }
    | MetaClawAction { skillId, instruction }

  Executor 接口：
    interface ActionExecutor {
      canExecute(action: Action): boolean;
      execute(action: Action): Promise<ExecutionResult>;
      rollback?(action: Action): Promise<void>;  // 如果可逆
    }

  注册多个 executor：
    executors.register(new PropertyExecutor());    // 内置
    executors.register(new HTTPExecutor());         // HTTP 调用
    executors.register(new MetaClawExecutor());     // MetaClaw Skill
    executors.register(new EmailExecutor());        // 发邮件
```

**工程量**：中等（~400行接口 + 各 executor 实现）。这实际上就是 MetaClaw 集成的泛化。

---

## 三、优先级排序

基于"投入产出比"和"与当前架构的兼容性"：

### 立刻可做（只需新领域包，零核心改动）

| 优先级 | 场景 | 预估工作量 | 商业价值 |
|--------|------|-----------|---------|
| ★★★ | HR 招聘决策 | 1天 | 高（企业普遍需求） |
| ★★★ | 保险理赔 | 1天 | 高（金融行业） |
| ★★☆ | 项目优先级排序 | 1天 | 中（技术团队） |
| ★★☆ | 采购比价 | 0.5天 | 中（供应链） |
| ★☆☆ | 教育课程推荐 | 0.5天 | 低（教育科技） |

### 近期扩展（中等核心改动）

| 优先级 | 扩展 | 改动范围 | 解锁的场景 |
|--------|------|---------|-----------|
| ★★★ | 不可逆动作标记 | types + simulator + controller | 医疗、合同、金融 |
| ★★★ | 多时间尺度 KPI | objective + simulator | 所有需要短/长期平衡的场景 |
| ★★☆ | Sequential Decision Tree | simulator + types | 医疗诊疗、客户关系、催收 |
| ★★☆ | Action Executor 抽象层 | 新模块 | 自动化运营、RPA、IoT |
| ★☆☆ | 连续参数优化 | 新模块 + 可选 GP 库 | 定价、预算分配 |

### 远期重构（大型架构变更）

| 优先级 | 扩展 | 工程量 | 解锁的场景 |
|--------|------|-------|-----------|
| ★★☆ | Multi-DCAS 协作 | 大 | 供应链、多方谈判 |
| ★☆☆ | Streaming Decision Engine | 非常大 | 高频交易、实时系统 |

---

## 四、对现有设计的反思

### 4.1 Strategy 类型系统太死板

当前 Strategy 是线性 action 列表。我们需要：

```typescript
// 当前
interface Strategy {
  actions: Action[];  // 线性序列
}

// 应该扩展为
interface Strategy {
  type: "linear" | "tree" | "parametric";
  actions?: Action[];              // linear
  decisionTree?: DecisionNode;     // tree
  parameterSpace?: ParameterDef[]; // parametric
}
```

**建议**：保持向后兼容。`type` 默认 `"linear"`，现有代码不用改。

### 4.2 ObjectiveFunction 缺少时间维度

当前 KPI 都是"最终状态"的快照评估。需要增加：
- `horizon`：何时评估这个 KPI
- `discountRate`：远期 KPI 的折现率
- `dependency`：KPI 之间的因果关系（互动率→长期粉丝增长）

### 4.3 Action 需要分级

当前所有 Action 被同等对待。需要增加：
- `reversibility`：可逆性
- `cost`：执行成本（不是 KPI 意义上的成本，是执行 action 本身的代价）
- `executionType`：内部属性修改 vs 外部 API 调用 vs MetaClaw Skill

### 4.4 WorldGraph 需要支持"模式"

当前所有领域共用一个无类型的 WorldGraph。理想状态应该是：
- 每个领域定义自己的 Schema（哪些实体类型、哪些关系类型、哪些属性是必须的）
- WorldGraph 可以验证数据是否符合 Schema
- 这就是 Ontology 自动发现（Phase 5.5 LLM Entity Extractor）的自然延伸

### 4.5 缺少"决策模板"注册机制

当前每个领域包各自 export 一堆函数（`seedData`, `generateStrategies`, `createObjective` 等）。应该有一个统一注册机制：

```typescript
interface DomainPlugin {
  name: string;
  ontologySchema: OntologySchema;
  seedData: (world: WorldGraph) => SeedResult;
  cascadeRules: CascadeRule[];
  strategies: (entityId: EntityId, params: any) => Strategy[];
  predictions: () => PredictionModel[];
  objective: () => ObjectiveSpec;
}

// 使用
dcas.registerDomain(legalPlugin);
dcas.registerDomain(contentPlugin);
dcas.registerDomain(investmentPlugin);
```

---

## 五、推荐的下一步开发计划

### Phase 6: 核心扩展

| Task | 内容 | 工程量 | 解锁 |
|------|------|-------|------|
| 6.1 | Action 分级（reversibility + executionType） | 小 | 医疗/合同/金融安全 |
| 6.2 | Multi-horizon KPI | 中 | 短/长期平衡 |
| 6.3 | Domain Plugin 注册机制 | 中 | 领域包标准化 |
| 6.4 | Sequential Decision Tree | 中 | 多轮决策 |
| 6.5 | Action Executor 抽象层 | 中 | 外部系统集成 |

### Phase 7: 新领域包

| Task | 内容 |
|------|------|
| 7.1 | @dcas/hr — 招聘决策 |
| 7.2 | @dcas/insurance — 保险理赔 |
| 7.3 | @dcas/project — 项目优先级 |

### Phase 8: 高级能力

| Task | 内容 |
|------|------|
| 8.1 | Multi-DCAS 协作（供应链/谈判） |
| 8.2 | 连续参数优化（贝叶斯优化） |
| 8.3 | Streaming Decision Engine（实时场景） |

---

## 六、结论

**现有架构的真正边界在"批处理 + 离散选择 + 单一决策者"。** 在这个边界内，DCAS 可以覆盖大量场景，只需新领域包。

**突破这个边界的三个方向**（按投入产出比排序）：
1. **多轮决策树**（中等改动，解锁医疗/CRM/催收）
2. **多时间尺度 + 不可逆标记**（小改动，解锁金融/医疗安全）
3. **Domain Plugin 标准化**（中等改动，降低新领域的接入成本）

**暂时不碰的**：实时流式引擎（工程量太大，ROI 不够）。

---

*Document Version: 1.0*
*Last Updated: 2026-03-24*
*Classification: Agioa Internal — 架构决策文档*
