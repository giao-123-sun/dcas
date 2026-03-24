import { HeuristicModel } from "@dcas/core";
import type { HeuristicRule } from "@dcas/core";

const engagementRules: HeuristicRule[] = [
  { description: "Deep content + engaged audience", condition: (ctx) => { const p = ctx.world.getEntitiesByType("ContentPlan")[0]; const a = ctx.world.getEntitiesByType("Audience")[0]; return (p?.properties.strategy as string) === "deep_content" && ((a?.properties.active_ratio as number) ?? 0) > 0.3; }, predict: () => ({ mean: 0.052, std: 0.008, confidence: 0.75 }) },
  { description: "Trend chasing", condition: (ctx) => (ctx.world.getEntitiesByType("ContentPlan")[0]?.properties.strategy as string) === "trend_chasing", predict: () => ({ mean: 0.038, std: 0.015, confidence: 0.55 }) },
  { description: "Default", condition: () => true, predict: (ctx) => { const r = (ctx.world.getEntitiesByType("Account")[0]?.properties.engagement_rate as number) ?? 0.03; return { mean: r * 1.1, std: r * 0.3, confidence: 0.6 }; } },
];

export function createEngagementPredictor(): HeuristicModel {
  return new HeuristicModel("content_engagement", "predicted_engagement_30d", engagementRules, { mean: 0.04, std: 0.01, confidence: 0.5 });
}

const growthRules: HeuristicRule[] = [
  { description: "Trend → high growth", condition: (ctx) => (ctx.world.getEntitiesByType("ContentPlan")[0]?.properties.strategy as string) === "trend_chasing", predict: (ctx) => { const f = (ctx.world.getEntitiesByType("Account")[0]?.properties.followers as number) ?? 100000; return { mean: f * 0.05, std: f * 0.02, confidence: 0.6 }; } },
  { description: "Deep → moderate growth", condition: (ctx) => (ctx.world.getEntitiesByType("ContentPlan")[0]?.properties.strategy as string) === "deep_content", predict: (ctx) => { const f = (ctx.world.getEntitiesByType("Account")[0]?.properties.followers as number) ?? 100000; return { mean: f * 0.03, std: f * 0.01, confidence: 0.7 }; } },
  { description: "Default", condition: () => true, predict: (ctx) => { const f = (ctx.world.getEntitiesByType("Account")[0]?.properties.followers as number) ?? 100000; return { mean: f * 0.02, std: f * 0.01, confidence: 0.55 }; } },
];

export function createGrowthPredictor(): HeuristicModel {
  return new HeuristicModel("content_growth", "predicted_followers_30d", growthRules, { mean: 3000, std: 1500, confidence: 0.5 });
}
