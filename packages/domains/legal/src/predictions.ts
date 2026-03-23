import { HeuristicModel } from "@dcas/core";
import type { HeuristicRule } from "@dcas/core";

/**
 * Legal domain heuristic prediction rules.
 */
const recoveryRules: HeuristicRule[] = [
  {
    description: "强证据 + 有利法官 → 高回收",
    condition: (ctx) => {
      const cases = ctx.world.getEntitiesByType("Case");
      const c = cases[0];
      if (!c) return false;
      const evidence = (c.properties.evidence_strength as number) ?? 0;
      const judges = ctx.world.getEntitiesByType("Judge");
      const proLabor = judges.length > 0 ? (judges[0].properties.pro_labor_rate as number) ?? 0.5 : 0.5;
      return evidence > 7 && proLabor > 0.7;
    },
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.85, std: amount * 0.1, confidence: 0.8 };
    },
  },
  {
    description: "弱证据 → 低回收",
    condition: (ctx) => {
      const c = ctx.world.getEntitiesByType("Case")[0];
      return ((c?.properties.evidence_strength as number) ?? 0) <= 5;
    },
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.4, std: amount * 0.15, confidence: 0.6 };
    },
  },
  {
    description: "中等证据 → 中等回收",
    condition: () => true, // fallback
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.6, std: amount * 0.12, confidence: 0.65 };
    },
  },
];

export function createRecoveryPredictor(): HeuristicModel {
  return new HeuristicModel(
    "legal_recovery_heuristic",
    "expected_recovery",
    recoveryRules,
    { mean: 50000, std: 15000, confidence: 0.5 },
  );
}

const costRules: HeuristicRule[] = [
  {
    description: "和解策略 → 低成本",
    condition: (ctx) => {
      const c = ctx.world.getEntitiesByType("Case")[0];
      return (c?.properties.strategy as string) === "settlement";
    },
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.1, std: amount * 0.03, confidence: 0.75 };
    },
  },
  {
    description: "抗辩策略 → 高成本",
    condition: (ctx) => {
      const c = ctx.world.getEntitiesByType("Case")[0];
      return (c?.properties.strategy as string) === "full_defense";
    },
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.45, std: amount * 0.1, confidence: 0.7 };
    },
  },
  {
    description: "默认中等成本",
    condition: () => true,
    predict: (ctx) => {
      const amount = (ctx.world.getEntitiesByType("Case")[0]?.properties.claim_amount as number) ?? 80000;
      return { mean: amount * 0.25, std: amount * 0.08, confidence: 0.6 };
    },
  },
];

export function createCostPredictor(): HeuristicModel {
  return new HeuristicModel(
    "legal_cost_heuristic",
    "expected_cost",
    costRules,
    { mean: 20000, std: 8000, confidence: 0.5 },
  );
}
