import type { ObjectiveSpec } from "@dcas/core";

/**
 * Standard legal case objective function.
 */
export function createLegalObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "recovery",
        name: "预期回收",
        direction: "maximize",
        weight: 0.5,
        target: 80000,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.expected_recovery as number) ?? 0;
        },
      },
      {
        id: "cost",
        name: "预期成本",
        direction: "minimize",
        weight: 0.3,
        target: 50000,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.expected_cost as number) ?? 0;
        },
      },
      {
        id: "speed",
        name: "结案速度",
        direction: "minimize",
        weight: 0.2,
        target: 6,
        compute: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          return (c?.properties.duration_months as number) ?? 0;
        },
      },
    ],
    constraints: [
      {
        id: "min_recovery",
        description: "回收不低于标的额50%",
        severity: "hard",
        check: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          const recovery = (c?.properties.expected_recovery as number) ?? 0;
          const amount = (c?.properties.claim_amount as number) ?? 1;
          return recovery >= amount * 0.5;
        },
      },
      {
        id: "budget_limit",
        description: "成本不超标的额60%",
        severity: "soft",
        check: (w) => {
          const c = w.getEntitiesByType("Case")[0];
          const cost = (c?.properties.expected_cost as number) ?? 0;
          const amount = (c?.properties.claim_amount as number) ?? 1;
          return cost <= amount * 0.6;
        },
      },
    ],
    tradeoffs: [],
  };
}
