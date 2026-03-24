import type { WorldGraph } from "@dcas/core";
import { ENTITY_TYPES, RELATION_TYPES } from "./ontology.js";

export function seedContentData(world: WorldGraph) {
  const platform = world.addEntity(ENTITY_TYPES.Platform, { name: "WeChat", algorithm_preference: "long_content", content_weight_bonus: 1.15 });
  const account = world.addEntity(ENTITY_TYPES.Account, { name: "TechInsight", followers: 123000, engagement_rate: 0.032, monthly_growth_rate: 0.021, niche: "AI/tech" });
  const audience = world.addEntity(ENTITY_TYPES.Audience, { size: 123000, active_ratio: 0.35, preferred_content_types: ["deep_content", "interactive"] });
  const compA = world.addEntity(ENTITY_TYPES.Competitor, { name: "CompA", followers: 180000, engagement_rate: 0.028, strategy: "trend_chasing", recent_trend: "declining" });
  const compB = world.addEntity(ENTITY_TYPES.Competitor, { name: "CompB", followers: 95000, engagement_rate: 0.055, strategy: "deep_content", recent_trend: "growing" });
  const plan = world.addEntity(ENTITY_TYPES.ContentPlan, { strategy: "undecided", weekly_deep: 0, weekly_trending: 0, weekly_interactive: 0, predicted_engagement_30d: 0, predicted_followers_30d: 0, cost_per_month: 0 });
  world.addRelation(RELATION_TYPES.owns, account.id, plan.id);
  world.addRelation(RELATION_TYPES.published_on, account.id, platform.id);
  world.addRelation(RELATION_TYPES.targets, account.id, audience.id);
  world.addRelation(RELATION_TYPES.competes_with, account.id, compA.id);
  world.addRelation(RELATION_TYPES.competes_with, account.id, compB.id);
  return { platform, account, audience, competitors: { compA, compB }, plan };
}
