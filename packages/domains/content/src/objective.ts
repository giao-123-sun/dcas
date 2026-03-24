import type { ObjectiveSpec } from "@dcas/core";

export function createContentObjective(): ObjectiveSpec {
  return {
    kpis: [
      { id: "engagement", name: "互动率", direction: "maximize", weight: 0.4, target: 0.05, threshold: 0.025, compute: (w) => (w.getEntitiesByType("ContentPlan")[0]?.properties.predicted_engagement_30d as number) ?? 0 },
      { id: "growth", name: "粉丝增长", direction: "maximize", weight: 0.35, target: 5000, compute: (w) => (w.getEntitiesByType("ContentPlan")[0]?.properties.predicted_followers_30d as number) ?? 0 },
      { id: "cost", name: "运营成本", direction: "minimize", weight: 0.25, target: 10000, compute: (w) => (w.getEntitiesByType("ContentPlan")[0]?.properties.cost_per_month as number) ?? 0 },
    ],
    constraints: [
      { id: "min_engagement", description: "互动率>=2%", severity: "hard", check: (w) => ((w.getEntitiesByType("ContentPlan")[0]?.properties.predicted_engagement_30d as number) ?? 0) >= 0.02 },
      { id: "budget", description: "月成本<=1万", severity: "soft", check: (w) => ((w.getEntitiesByType("ContentPlan")[0]?.properties.cost_per_month as number) ?? 0) <= 10000 },
    ],
    tradeoffs: [],
  };
}
