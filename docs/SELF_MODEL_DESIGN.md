# DCAS Self-Model 设计：系统必须认识自己

## 为什么需要这个

之前的World Model只建模了外部世界（案件、法官、法条、对手）。但缺了一个最关键的实体：**我自己**。

类比：让小孩造摩天大楼，他首先需要知道：
- **我是谁** — 我是一个8岁小孩，不是建筑公司（状态）
- **我会什么** — 我会搭积木但不会操作吊车（能力）
- **我有什么** — 我有100块积木和一把小铲子（资源）

然后他才能做出合理的决策：不是去造摩天大楼，而是先搭一个积木塔，或者找一个会造房子的大人合作。

没有Self-Model的系统会：
- 生成自己执行不了的策略（"请调取企业全部银行流水" — 但你没有调查令权限）
- 低估完成任务的成本（"预计3天完成" — 但律师团队本周已经满负荷了）
- 忽略资源约束（"同时推进5个案件的庭审" — 但只有2个律师可用）
- 不知道什么时候该求助（"这个案件涉及海事法" — 但团队没有海事法专长）

---

## Self-Model 在 World Model 中的位置

```
World Model (L1)
├── External World（外部世界 — 之前已有的）
│   ├── Cases, Judges, Statutes, Precedents, Opponents...
│   └── Market, Clients, Regulations...
│
└── Self-Model（自我模型 — 新增）
    ├── Identity（我是谁）
    ├── Capabilities（我能做什么）
    ├── Resources（我有什么）
    ├── State（我现在怎么样）
    └── Boundaries（我的边界在哪）
```

Self-Model不是一个独立的层，而是**World Model中的一组特殊实体**。它和外部实体一样是图谱中的节点，有属性、有关系、参与级联传播。区别在于：这些实体描述的是"执行决策的主体"而不是"决策涉及的对象"。

---

## Self-Model 的五个维度

### 1. Identity（身份）— 我是谁

定义系统运营者的基本身份、组织结构、市场定位。

**图谱表示**:
```
(Self:LawFirm) — 律所节点，包含名称、专长、执业地域
  ├── (TeamMember:张律师) — 资深合伙人，12年经验，劳动争议专长
  ├── (TeamMember:李律师) — 初级律师，3年经验
  └── 关系: MEMBER_OF, REPORTS_TO
```

### 2. Capabilities（能力）— 我能做什么

不是笼统的分数，而是**具体的、可量化的、和任务对应的**能力矩阵。

关键维度:
- 每个案件类型 × 每个任务类型的能力分数
- 经验次数和上次实践时间（技能会生疏）
- 工具/系统的掌握程度
- 关系网络（能调动谁）
- **能力缺口**（明确知道自己不会什么）

### 3. Resources（资源）— 我有什么

- **人力**: 可分配的律师、当前利用率、瓶颈
- **时间**: 本周/月可用小时数、已承诺的截止日期
- **财务**: 客户预算、律所现金流、垫资额度
- **信息**: 可访问的数据库、专家联系人、所内类似案例

### 4. State（当前状态）— 我现在怎么样

动态变化的运行时状态:
- 每个成员的负荷、疲劳、近期表现
- 团队整体士气
- 知识鲜度（最近学了什么、什么可能过时了）

### 5. Boundaries（边界）— 我的红线在哪

- **伦理边界**: 绝对不可违反的规则
- **法律边界**: 利益冲突检查、执业范围
- **能力边界**: "本所不做刑事辩护"
- **资源边界**: 工时硬上限、预算天花板

---

## Self-Model 如何影响其他层

### 对 L3 预测的影响

预测"我执行某个策略会怎样"时，必须考虑我的能力和状态：

```
之前: predict(world, "win_probability")
  → 0.785 (纯案件特征)

现在: predict(world, "win_probability", { selfModel })
  → 0.76 (考虑了律师疲劳和时间压力，比纯案件分析低)
```

ML 模型的特征向量扩展:
- lead_lawyer_proficiency, lead_lawyer_fatigue
- available_hours_before_deadline
- team_utilization_rate
- internal_precedent_count

### 对 L4 策略生成的影响

**这是 Self-Model 影响最大的地方。** 策略必须通过可行性过滤:

1. **能力检查**: 团队有人能做这个策略要求的事吗？
2. **资源检查**: 估算工时 vs 可用时间
3. **财务检查**: 估算成本 vs 客户预算
4. **时间线检查**: 估算周期 vs deadline
5. **边界检查**: 有无绝对红线被违反？
6. **负荷检查**: 执行团队是否已过载？

不可行的策略不是直接删除，而是:
- 标记不可行原因
- 自动生成缓解方案（外包、学习、调整策略、协商延期）
- 排在推荐列表最后

### 对 L4 模拟的影响

模拟中，行动的执行质量不再是确定的:

```
qualityFactor =
  proficiency                           // 基础能力
  × (1 - fatiguePenalty)                // 疲劳惩罚
  × experienceBonus                     // 经验加成
  × moraleBonus                         // 士气影响

actualEffect = idealEffect × qualityFactor + noise
```

### 对 L6 决策循环的影响

Self 状态变化本身触发决策:
- 律师过载 → 触发资源重平衡
- 能力缺口预警 → 触发能力规划
- 资源枯竭 → 触发客户沟通

---

## 级联传播示例

张律师突然请假一周:

```
事件: lawyer_zhang.available_hours = 0

第1层: self.total_available_hours 下降
       self.workload_state → "heavy"

第2层: 张律师负责的案件:
       case_001.lead_available = false
       case_003.hearing_preparedness 大幅下降

第3层: L6 检测到 case_003 告警
       → 策略A: 申请延期（需要 Self 知道"我可以申请延期"）
       → 策略B: 让李律师顶上（需要 Self 评估"李律师能力够吗"）
       → 策略C: 请外部律师（需要 Self 知道"关系网络中谁能帮"）
```

---

*设计者: Agioa Architect*
*本文档为 SELF_MODEL_PLAN.md 的设计原文*
