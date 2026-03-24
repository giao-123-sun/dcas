/**
 * Chinese locale strings for DCAS core engine.
 * All user-facing text in the core engine should reference this file.
 */

export interface Locale {
  simulation: {
    startSimulation: (name: string) => string;
    entityNotFound: (step: number, id: string) => string;
    stepResult: (step: number, desc: string, directCount: number, cascadeCount: number) => string;
    conditionalTriggered: (desc: string) => string;
    finalScore: (score: string, hardViolation: boolean, alerts: string[]) => string;
  };
  comparator: {
    topRanked: (total: number) => string;
    ranked: (rank: number, total: number) => string;
    hardViolation: string;
    compositeScore: (score: string) => string;
    bestMetric: (name: string, pct: string) => string;
    softViolations: (count: number) => string;
  };
  controller: {
    autoExecute: (name: string, score: string, worst: string) => string;
    recommend: (name: string, score: string, alertCount: number) => string;
  };
  learning: {
    accuratePrediction: (kpi: string, pct: string) => string;
    largeBias: (kpi: string, pct: string) => string;
    unexpectedEffect: (effect: string) => string;
    strategyUnexpected: (stratId: string, effect: string) => string;
    strategyMatchedExpected: (stratId: string) => string;
    avgDeviation: (pct: string) => string;
    systematicOverestimate: string;
    systematicUnderestimate: string;
    systematicBias: (stratId: string, kpi: string, dir: string, pct: string, n: number) => string;
    strategyBiasPattern: (stratId: string, kpi: string, dir: string) => string;
  };
  feedback: {
    predictionDeviation: (pct: string, predicted: number, actual: number) => string;
    newSkillHint: (name: string) => string;
    anomalyFound: (desc: string) => string;
    lowQuality: (reward: string) => string;
  };
  translator: {
    goalSection: string;
    strategySection: string;
    constraintSection: string;
    contextSection: string;
    defaultGoal: string;
    defaultAction: string;
    defaultConstraint: string;
    kpiLine: (name: string, value: number, pct: string) => string;
    actionLine: (i: number, prop: string, old: string, val: string) => string;
    rankInfo: (rank: number) => string;
    riskInfo: (best: string, expected: string, worst: string) => string;
  };
  serializer: {
    worldState: string;
    entityCount: (type: string, count: number) => string;
    relations: string;
    objectiveFunction: string;
    kpiMetrics: string;
    kpiLine: (name: string, id: string, dir: string, weight: string, target?: number) => string;
    constraints: string;
  };
}

export const zh: Locale = {
  simulation: {
    startSimulation: (name) => `开始模拟策略: ${name}`,
    entityNotFound: (step, id) => `步骤${step}: 实体 ${id} 不存在，跳过`,
    stepResult: (step, desc, directCount, cascadeCount) =>
      `步骤${step}: ${desc} → 直接变更${directCount}项，级联传播${cascadeCount}项`,
    conditionalTriggered: (desc) => `  条件触发: ${desc}`,
    finalScore: (score, hardViolation, alerts) =>
      `最终得分: ${score}${hardViolation ? " (硬约束违反!)" : ""}${alerts.length > 0 ? ` 告警: ${alerts.join(", ")}` : ""}`,
  },
  comparator: {
    topRanked: (total) => `在${total}个候选策略中综合得分最高`,
    ranked: (rank, total) => `排名第${rank}/${total}`,
    hardViolation: "违反硬约束，不推荐",
    compositeScore: (score) => `综合得分 ${score}`,
    bestMetric: (name, pct) => `最优指标: ${name}(${pct}%)`,
    softViolations: (count) => `${count}项软约束告警`,
  },
  controller: {
    autoExecute: (name, score, worst) =>
      `自动执行: ${name} (得分${score}, 最差${worst})`,
    recommend: (name, score, alertCount) =>
      `推荐: ${name} (得分${score})${alertCount > 0 ? `, ${alertCount}项KPI告警` : ""}`,
  },
  learning: {
    accuratePrediction: (kpi, pct) =>
      `KPI "${kpi}" 预测准确 (偏差${pct}%)`,
    largeBias: (kpi, pct) =>
      `KPI "${kpi}" 预测偏差过大 (${pct}%)，需要校准模型`,
    unexpectedEffect: (effect) =>
      `意外效应: "${effect}" — 可能需要扩展世界模型`,
    strategyUnexpected: (stratId, effect) =>
      `策略 ${stratId} 产生意外效应: ${effect}`,
    strategyMatchedExpected: (stratId) =>
      `策略 ${stratId} 在此类场景下表现符合预期`,
    avgDeviation: (pct) => `平均偏差 ${pct}%`,
    systematicOverestimate: "系统性高估",
    systematicUnderestimate: "系统性低估",
    systematicBias: (stratId, kpi, dir, pct, n) =>
      `策略 "${stratId}" 的 KPI "${kpi}" 存在${dir} (平均偏差 ${pct}%, 样本数${n})`,
    strategyBiasPattern: (stratId, kpi, dir) =>
      `策略 ${stratId} 对 ${kpi} 存在${dir}`,
  },
  feedback: {
    predictionDeviation: (pct, predicted, actual) =>
      `预测偏差 ${pct}%: 预测${predicted}, 实际${actual}`,
    newSkillHint: (name) =>
      `MetaClaw自学习了新技能: "${name}" — 可能暗示世界模型缺少某些要素`,
    anomalyFound: (desc) => `异常发现: ${desc}`,
    lowQuality: (reward) =>
      `执行质量偏低 (avg_reward=${reward})，策略可能难以执行`,
  },
  translator: {
    goalSection: "## 目标",
    strategySection: "## 策略",
    constraintSection: "## 约束",
    contextSection: "## 上下文",
    defaultGoal: "优化综合指标",
    defaultAction: "1. 按照策略模拟结果执行",
    defaultConstraint: "- 遵守所有硬约束",
    kpiLine: (name, value, pct) =>
      `- ${name}: 当前值${value}, 目标得分${pct}%`,
    actionLine: (i, prop, old, val) =>
      `${i}. 将 ${prop} 从 ${old} 调整为 ${val}`,
    rankInfo: (rank) =>
      `- 该策略在${rank}个候选方案中排名第${rank}`,
    riskInfo: (best, expected, worst) =>
      `- 风险评估: 最好${best}, 预期${expected}, 最差${worst}`,
  },
  serializer: {
    worldState: "## 世界状态",
    entityCount: (type, count) => `### ${type} (${count}个)`,
    relations: "### 关系",
    objectiveFunction: "## 目标函数",
    kpiMetrics: "### KPI指标",
    kpiLine: (name, id, dir, weight, target?) =>
      `- ${name} (${id}): ${dir}, 权重${weight}%${target ? `, 目标${target}` : ""}`,
    constraints: "### 约束",
  },
};
