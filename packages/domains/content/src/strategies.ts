import type { Strategy } from "@dcas/core";
import type { EntityId } from "@dcas/core";

export function generateContentStrategies(planId: EntityId): Strategy[] {
  return [
    { id: "deep_focus", name: "深度内容优先", description: "3篇深度+1篇互动/周", generatedBy: "template" as const, actions: [
      { description: "深度内容策略", entityId: planId, property: "strategy", value: "deep_content" },
      { description: "周3篇深度", entityId: planId, property: "weekly_deep", value: 3 },
      { description: "周0热点", entityId: planId, property: "weekly_trending", value: 0 },
      { description: "周1互动", entityId: planId, property: "weekly_interactive", value: 1 },
      { description: "预测互动率5.2%", entityId: planId, property: "predicted_engagement_30d", value: 0.052 },
      { description: "预测增粉3500", entityId: planId, property: "predicted_followers_30d", value: 3500 },
      { description: "月成本8000", entityId: planId, property: "cost_per_month", value: 8000 },
    ]},
    { id: "trend_chase", name: "热点追踪", description: "2篇热点+2篇短内容/周", generatedBy: "template" as const, actions: [
      { description: "热点策略", entityId: planId, property: "strategy", value: "trend_chasing" },
      { description: "周1深度", entityId: planId, property: "weekly_deep", value: 1 },
      { description: "周2热点", entityId: planId, property: "weekly_trending", value: 2 },
      { description: "周2互动", entityId: planId, property: "weekly_interactive", value: 2 },
      { description: "预测互动率3.8%", entityId: planId, property: "predicted_engagement_30d", value: 0.038 },
      { description: "预测增粉6000", entityId: planId, property: "predicted_followers_30d", value: 6000 },
      { description: "月成本5000", entityId: planId, property: "cost_per_month", value: 5000 },
    ]},
    { id: "balanced", name: "平衡策略", description: "深度+热点均衡", generatedBy: "template" as const, actions: [
      { description: "平衡策略", entityId: planId, property: "strategy", value: "balanced" },
      { description: "周2深度", entityId: planId, property: "weekly_deep", value: 2 },
      { description: "周1热点", entityId: planId, property: "weekly_trending", value: 1 },
      { description: "周1互动", entityId: planId, property: "weekly_interactive", value: 1 },
      { description: "预测互动率4.5%", entityId: planId, property: "predicted_engagement_30d", value: 0.045 },
      { description: "预测增粉4500", entityId: planId, property: "predicted_followers_30d", value: 4500 },
      { description: "月成本6500", entityId: planId, property: "cost_per_month", value: 6500 },
    ]},
  ];
}
