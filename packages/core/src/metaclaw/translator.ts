// ============================================================
// Strategy-to-Skill Translator
// Converts DCAS strategy output → MetaClaw Skill format
// ============================================================

import type { SimulationResult, RankedStrategy } from "../simulation/types.js";
import type { ObjectiveSpec } from "../objective/types.js";
import type { WorldGraph } from "../world-model/graph.js";
import type { MetaClawSkill, DCASMetadata } from "./types.js";
import type { LLMClient } from "../llm/client.js";
import { serializeWorldForLLM } from "../llm/world-serializer.js";
import { generateId } from "../utils/id.js";
import { getLocale } from "../i18n/index.js";
import { promptsZh } from "../llm/prompts/zh.js";

export interface TranslatorInput {
  /** The simulation result for this strategy */
  simulation: SimulationResult;
  /** The ranking info */
  ranking: RankedStrategy;
  /** Original objective spec */
  objective: ObjectiveSpec;
  /** Original world model (for context) */
  world: WorldGraph;
  /** Domain context string */
  domainContext: string;
  /** Version number (for iteration) */
  version?: number;
  /** Previous skill name this supersedes */
  supersedes?: string;
}

/**
 * Translate a DCAS strategy into a MetaClaw Skill.
 *
 * Uses LLM to generate the 4-section instruction if client is provided,
 * otherwise generates from template.
 */
export async function translateToSkill(
  input: TranslatorInput,
  llmClient?: LLMClient,
): Promise<MetaClawSkill> {
  const { simulation, ranking, objective, world, domainContext, version = 1, supersedes } = input;

  const strategyId = `strat_${Date.now().toString(36)}_${generateId().slice(0, 8)}`;
  const skillName = `dcas_${simulation.strategyId}_v${version}`;

  // Determine priority from ranking
  const priority = ranking.rank === 1 ? "high" as const
    : ranking.rank <= 2 ? "medium" as const
    : "low" as const;

  // Build instruction
  const instruction = llmClient
    ? await generateInstructionWithLLM(llmClient, input)
    : generateInstructionFromTemplate(input);

  // Build metadata
  const primaryKPI = objective.kpis.length > 0 ? objective.kpis[0] : undefined;
  const primaryKPIResult = ranking.objectiveResult.kpiResults.length > 0 ? ranking.objectiveResult.kpiResults[0] : undefined;

  const metadata: DCASMetadata = {
    strategy_id: strategyId,
    objective: {
      primary_kpi: primaryKPI?.id ?? "",
      direction: primaryKPI?.direction ?? "maximize",
      target: primaryKPI?.target,
      confidence: ranking.riskProfile.expectedCase > 0 ? 0.7 : 0.3,
    },
    world_context: {
      key_entities: world.getAllEntities().slice(0, 5).map((e) => `${e.type}:${e.id.slice(0, 8)}`),
      risk_level: ranking.score > 0.7 ? "low" : ranking.score > 0.4 ? "medium" : "high",
    },
    simulation_summary: {
      strategies_evaluated: 1, // will be updated by caller
      this_strategy_rank: ranking.rank,
      expected_kpi: {
        mean: ranking.riskProfile.expectedCase,
        p25: ranking.riskProfile.worstCase,
        p75: ranking.riskProfile.bestCase,
        confidence: 0.7,
      },
    },
    version,
    supersedes,
  };

  // Build tags
  const tags = ["dcas", simulation.strategyId];
  const entityTypes = [...new Set(world.getAllEntities().map((e) => e.type.toLowerCase()))];
  tags.push(...entityTypes.slice(0, 3));

  return {
    name: skillName,
    instruction,
    tags,
    created_at: new Date().toISOString(),
    source: "dcas",
    priority,
    dcas_metadata: metadata,
  };
}

/**
 * Generate the 4-section instruction using LLM.
 */
async function generateInstructionWithLLM(
  client: LLMClient,
  input: TranslatorInput,
): Promise<string> {
  const { simulation, ranking, objective, world, domainContext } = input;
  const worldText = serializeWorldForLLM(world);
  const priority = ranking.rank === 1 ? "HIGH" : ranking.rank <= 2 ? "MEDIUM" : "LOW";

  const kpiEval = ranking.objectiveResult.kpiResults
    .map((r) => `- ${r.name}: ${r.value} (${(r.normalizedScore * 100).toFixed(0)}%)`)
    .join("\n");

  const prompt = promptsZh.translateStrategy(
    domainContext,
    simulation.strategyName,
    simulation.strategyId,
    ranking.score.toFixed(3),
    ranking.rank,
    simulation.reasoningChain.join("\n"),
    worldText,
    kpiEval,
    priority,
  );

  const response = await client.chat([{ role: "user", content: prompt }]);
  return response.content;
}

/**
 * Generate instruction from template (no LLM needed).
 */
function generateInstructionFromTemplate(input: TranslatorInput): string {
  const { simulation, ranking, objective } = input;
  const t = getLocale().translator;
  const priority = ranking.rank === 1 ? "HIGH" : ranking.rank <= 2 ? "MEDIUM" : "LOW";

  const kpiLines = ranking.objectiveResult.kpiResults
    .map((r) => t.kpiLine(r.name, r.value, (r.normalizedScore * 100).toFixed(0)))
    .join("\n");

  const actionLines = simulation.diffs
    .filter((d) => d.cause === "direct")
    .map((d, i) => t.actionLine(i + 1, d.property, JSON.stringify(d.oldValue), JSON.stringify(d.newValue)))
    .join("\n");

  const constraintLines = objective.constraints
    .map((c) => `- [${c.severity}] ${c.description}`)
    .join("\n");

  return `[DCAS STRATEGIC DIRECTIVE — ${priority}]

${t.goalSection}
${objective.kpis[0]?.name ?? t.defaultGoal}, target score > ${(ranking.score * 1.1).toFixed(2)}

${t.strategySection}
${actionLines || t.defaultAction}

${t.constraintSection}
${constraintLines || t.defaultConstraint}

${t.contextSection}
${kpiLines}
${t.rankInfo(ranking.rank)}
${t.riskInfo(ranking.riskProfile.bestCase.toFixed(3), ranking.riskProfile.expectedCase.toFixed(3), ranking.riskProfile.worstCase.toFixed(3))}`;
}

/**
 * Validate a generated skill against the spec requirements.
 */
export function validateSkill(skill: MetaClawSkill): { valid: boolean; failures: string[] } {
  const failures: string[] = [];
  const t = getLocale().translator;

  if (skill.instruction.length < 100) failures.push("instruction_too_short");
  if (skill.instruction.length > 5000) failures.push("instruction_too_long");
  if (!skill.instruction.includes(t.goalSection)) failures.push("missing_goal_section");
  if (!skill.instruction.includes(t.strategySection)) failures.push("missing_strategy_section");
  if (!skill.instruction.includes(t.constraintSection)) failures.push("missing_constraint_section");
  if (!skill.instruction.includes(t.contextSection)) failures.push("missing_context_section");
  if (!skill.tags.includes("dcas")) failures.push("missing_dcas_tag");
  if (!skill.dcas_metadata?.strategy_id) failures.push("missing_strategy_id");
  if (!skill.dcas_metadata?.objective?.primary_kpi) failures.push("missing_primary_kpi");

  return { valid: failures.length === 0, failures };
}
