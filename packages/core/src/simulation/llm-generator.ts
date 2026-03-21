// ============================================================
// LLM Strategy Generator — Gemini generates candidate strategies
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { EntityId } from "../world-model/types.js";
import type { ObjectiveSpec } from "../objective/types.js";
import type { Strategy, Action } from "./types.js";
import type { LLMClient } from "../llm/client.js";
import { serializeWorldForLLM, serializeObjectiveForLLM } from "../llm/world-serializer.js";

interface LLMStrategyResponse {
  strategies: Array<{
    id: string;
    name: string;
    description: string;
    reasoning: string;
    actions: Array<{
      description: string;
      entity_type: string;
      property: string;
      value: string | number | boolean;
    }>;
  }>;
}

/**
 * Use Gemini to generate candidate strategies based on world state and objectives.
 *
 * The LLM reasons about the world model and proposes concrete actions
 * that can be simulated by the Strategy Engine.
 */
export async function generateStrategiesWithLLM(
  client: LLMClient,
  world: WorldGraph,
  objective: ObjectiveSpec,
  domainContext: string,
  targetEntityId: EntityId,
  count: number = 3,
): Promise<Strategy[]> {
  const worldText = serializeWorldForLLM(world);
  const objectiveText = serializeObjectiveForLLM({
    kpis: objective.kpis.map((k) => ({
      id: k.id,
      name: k.name,
      direction: k.direction,
      weight: k.weight,
      target: k.target,
    })),
    constraints: objective.constraints.map((c) => ({
      id: c.id,
      description: c.description,
      severity: c.severity,
    })),
  });

  const targetEntity = world.getEntity(targetEntityId);
  if (!targetEntity) throw new Error(`Target entity ${targetEntityId} not found`);

  const prompt = `${domainContext}

${worldText}

${objectiveText}

目标实体: [${targetEntityId.slice(0, 8)}] 类型=${targetEntity.type}

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
        {
          "description": "动作描述",
          "entity_type": "Case",
          "property": "strategy",
          "value": "settlement"
        }
      ]
    }
  ]
}`;

  const result = await client.chatJSON<LLMStrategyResponse>([
    { role: "user", content: prompt },
  ]);

  // Convert LLM output to Strategy objects
  return result.strategies.map((s) => {
    // Resolve entity IDs: find first entity of the specified type
    const actions: Action[] = s.actions.map((a) => {
      const entities = world.getEntitiesByType(a.entity_type);
      const entityId = entities.length > 0 ? entities[0].id : targetEntityId;
      return {
        description: a.description,
        entityId,
        property: a.property,
        value: a.value,
      };
    });

    return {
      id: s.id,
      name: s.name,
      description: s.description,
      actions,
      generatedBy: "llm" as const,
    };
  });
}
