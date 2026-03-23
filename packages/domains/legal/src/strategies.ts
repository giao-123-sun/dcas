import type { Strategy } from "@dcas/core";
import type { EntityId } from "@dcas/core";

/**
 * Generate legal strategy templates for a given case.
 */
export function generateLegalStrategies(caseId: EntityId, caseAmount: number): Strategy[] {
  return [
    {
      id: "settlement",
      name: "和解谈判",
      description: "通过谈判达成和解，优先快速回款",
      generatedBy: "template" as const,
      actions: [
        { description: "设定策略为和解", entityId: caseId, property: "strategy", value: "settlement" },
        { description: "预期回收为标的额的70%", entityId: caseId, property: "expected_recovery", value: Math.round(caseAmount * 0.7) },
        { description: "预期成本为标的额的15%", entityId: caseId, property: "expected_cost", value: Math.round(caseAmount * 0.15) },
        { description: "预期1-2个月结案", entityId: caseId, property: "duration_months", value: 1.5 },
      ],
    },
    {
      id: "full_defense",
      name: "全面抗辩",
      description: "进入正式仲裁/诉讼程序，争取最高赔偿",
      generatedBy: "template" as const,
      actions: [
        { description: "设定策略为全面抗辩", entityId: caseId, property: "strategy", value: "full_defense" },
        { description: "预期回收为标的额的85%", entityId: caseId, property: "expected_recovery", value: Math.round(caseAmount * 0.85) },
        { description: "预期成本为标的额的50%", entityId: caseId, property: "expected_cost", value: Math.round(caseAmount * 0.5) },
        { description: "预期4-6个月结案", entityId: caseId, property: "duration_months", value: 5 },
      ],
    },
    {
      id: "jurisdiction",
      name: "管辖权异议",
      description: "对管辖权提出异议，争取换法院/仲裁委",
      generatedBy: "template" as const,
      actions: [
        { description: "设定策略为管辖权异议", entityId: caseId, property: "strategy", value: "jurisdiction" },
        { description: "预期回收为标的额的65%", entityId: caseId, property: "expected_recovery", value: Math.round(caseAmount * 0.65) },
        { description: "预期成本为标的额的30%", entityId: caseId, property: "expected_cost", value: Math.round(caseAmount * 0.3) },
        { description: "预期3个月结案", entityId: caseId, property: "duration_months", value: 3 },
      ],
    },
  ];
}
