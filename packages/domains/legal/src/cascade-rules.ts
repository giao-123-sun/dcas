import type { CascadeRule } from "@dcas/core";
import { ENTITY_TYPES } from "./ontology.js";

/**
 * Legal domain cascade propagation rules.
 */
export const legalCascadeRules: CascadeRule[] = [
  // When Case.strategy changes → update Budget.allocated
  {
    sourceType: ENTITY_TYPES.Case,
    sourceProperty: "strategy",
    relationTypes: ["has_budget"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => {
      const strategy = typeof ctx.newValue === "string" ? ctx.newValue : "unknown";
      const amount = typeof ctx.sourceEntity.properties.claim_amount === "number"
        ? ctx.sourceEntity.properties.claim_amount : 80000;
      const costs: Record<string, number> = {
        settlement: amount * 0.15,
        full_defense: amount * 0.5,
        jurisdiction: amount * 0.3,
        partial_admit: amount * 0.2,
      };
      const cost = costs[strategy] ?? amount * 0.25;
      return { targetProperty: "allocated", value: cost };
    },
  },

  // When Case.expected_cost changes → update Budget.allocated
  {
    sourceType: ENTITY_TYPES.Case,
    sourceProperty: "expected_cost",
    relationTypes: ["has_budget"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => ({
      targetProperty: "allocated",
      value: ctx.newValue,
    }),
  },

  // NOTE: base_win_probability → expected_recovery is handled in the
  // objective function (KPI compute), not via cascade, because cascade
  // propagates along relations and cannot target the source entity itself.
];
