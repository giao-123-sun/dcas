// ============================================================
// Serialize WorldGraph to text for LLM consumption
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";

/**
 * Serialize a WorldGraph into a concise text representation
 * that an LLM can reason over.
 */
export function serializeWorldForLLM(world: WorldGraph): string {
  const lines: string[] = [];

  // Entities grouped by type
  const entities = world.getAllEntities();
  const byType = new Map<string, typeof entities>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push(e);
  }

  lines.push("## 世界状态");
  lines.push("");

  for (const [type, ents] of byType) {
    lines.push(`### ${type} (${ents.length}个)`);
    for (const e of ents) {
      const props = Object.entries(e.properties)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      lines.push(`- [${e.id.slice(0, 12)}] ${props}`);
    }
    lines.push("");
  }

  // Relations
  const relations = world.getAllRelations();
  if (relations.length > 0) {
    lines.push("### 关系");
    for (const r of relations) {
      const props = Object.entries(r.properties)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(", ");
      const propsStr = props ? ` (${props})` : "";
      lines.push(`- [${r.sourceId.slice(0, 12)}] —[${r.type}]→ [${r.targetId.slice(0, 12)}]${propsStr}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Serialize ObjectiveSpec into text for LLM.
 */
export function serializeObjectiveForLLM(objective: {
  kpis: Array<{ id: string; name: string; direction: string; weight: number; target?: number }>;
  constraints: Array<{ id: string; description: string; severity: string }>;
}): string {
  const lines: string[] = [];
  lines.push("## 目标函数");
  lines.push("");
  lines.push("### KPI指标");
  for (const k of objective.kpis) {
    lines.push(`- ${k.name} (${k.id}): ${k.direction}, 权重${(k.weight * 100).toFixed(0)}%${k.target ? `, 目标${k.target}` : ""}`);
  }
  lines.push("");
  lines.push("### 约束");
  for (const c of objective.constraints) {
    lines.push(`- [${c.severity}] ${c.description}`);
  }
  return lines.join("\n");
}
