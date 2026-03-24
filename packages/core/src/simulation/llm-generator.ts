// ============================================================
// LLM Strategy Generator — Gemini generates candidate strategies
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { EntityId } from "../world-model/types.js";
import type { ObjectiveSpec } from "../objective/types.js";
import type { Strategy, Action } from "./types.js";
import type { LLMClient } from "../llm/client.js";
import { serializeWorldForLLM, serializeObjectiveForLLM } from "../llm/world-serializer.js";
import { promptsZh } from "../llm/prompts/zh.js";

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

  const entityInfo = `Target entity: [${targetEntityId.slice(0, 12)}] type=${targetEntity.type}`;

  const prompt = promptsZh.generateStrategies(
    domainContext,
    worldText,
    objectiveText,
    entityInfo,
    count,
  );

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
