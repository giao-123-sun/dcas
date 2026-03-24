/**
 * Chinese LLM prompt templates.
 */
export const promptsZh = {
  predictProperty: (domainContext: string, worldText: string, actionText: string, targetProperty: string) =>
`${domainContext}

${worldText}
${actionText}

请预测属性 "${targetProperty}" 的值。

要求:
1. 基于上述世界状态和领域知识进行推理
2. 给出预测的均值(mean)、标准差(std)和置信度(confidence, 0-1)
3. 简要说明推理过程

返回JSON格式:
{
  "mean": <数值>,
  "std": <数值，表示不确定性>,
  "confidence": <0到1之间>,
  "reasoning": "<一句话说明为什么这么预测>"
}`,

  generateStrategies: (domainContext: string, worldText: string, objectiveText: string, entityInfo: string, count: number) =>
`${domainContext}

${worldText}

${objectiveText}

${entityInfo}

请生成${count}个不同的候选策略来优化上述目标函数。

要求:
1. 每个策略要有明确的名称和描述
2. 每个策略包含3-6个具体的动作步骤
3. 动作必须是对实体属性的具体修改（给出entity_type, property, value）
4. 策略之间要有明显区别（保守/激进/创新等不同方向）
5. 考虑约束条件，避免生成违反硬约束的策略
6. 简要说明每个策略的推理逻辑

返回JSON格式:
{
  "strategies": [
    {
      "id": "strategy_1",
      "name": "策略名称",
      "description": "一句话描述",
      "reasoning": "为什么推荐这个策略",
      "actions": [
        { "description": "动作描述", "entity_type": "Case", "property": "strategy", "value": "settlement" }
      ]
    }
  ]
}`,

  translateStrategy: (domainContext: string, strategyName: string, strategyId: string, score: string, rank: number, reasoning: string, worldText: string, kpiEval: string, priority: string) =>
`你是一个策略翻译器。请将以下DCAS策略分析结果翻译为一个Agent可执行的行为指令。

${domainContext}

策略名称: ${strategyName}
策略描述: ${strategyId}
综合得分: ${score} (排名第${rank})

策略执行步骤:
${reasoning}

世界状态摘要:
${worldText}

KPI评估:
${kpiEval}

请生成以下格式的行为指令（纯文本，不要JSON）:

[DCAS STRATEGIC DIRECTIVE — ${priority}]

## 目标
{用一句话说明这个策略在优化什么}

## 策略
{具体的行为指令，3-7条，带数字}

## 约束
{不能做的事情，2-4条}

## 上下文
{关键背景信息，3-5条}`,

  adversaryPredict: (worldText: string, actionText: string, entityType: string, behaviors: string, targetProperty: string) =>
`你是对手方的法律顾问。根据以下情况预测对手的反应。

${worldText}

${actionText}

对手画像:
- 类型: ${entityType}
- 历史行为模式: ${behaviors}

请预测对手在 "${targetProperty}" 方面的反应值。
返回JSON: { "mean": <数值>, "std": <不确定性>, "confidence": <0-1>, "reasoning": "<推理>" }`,
};
