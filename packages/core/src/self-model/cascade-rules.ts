import type { CascadeRule } from "../world-model/types.js";

/**
 * Generic cascade rules for Self-Model entities.
 * These propagate team member changes to the Self entity.
 */
export const selfModelCascadeRules: CascadeRule[] = [
  // When TeamMember.current_load changes → check if Self should be marked overloaded
  {
    sourceType: "TeamMember",
    sourceProperty: "current_load",
    relationTypes: ["member_of"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => {
      const load = typeof ctx.newValue === "number" ? ctx.newValue : 0;
      const maxLoad = typeof ctx.sourceEntity.properties.max_load === "number"
        ? ctx.sourceEntity.properties.max_load : 10;
      if (maxLoad > 0 && load / maxLoad > 0.9) {
        return { targetProperty: "workload_state", value: "overloaded" };
      }
      if (maxLoad > 0 && load / maxLoad > 0.7) {
        return { targetProperty: "workload_state", value: "heavy" };
      }
      return { targetProperty: "workload_state", value: "optimal" };
    },
  },

  // When TeamMember.available_hours changes → update Self.total_available_hours
  {
    sourceType: "TeamMember",
    sourceProperty: "available_hours",
    relationTypes: ["member_of"],
    direction: "outgoing",
    maxDepth: 2,
    effect: (ctx) => {
      const delta = (typeof ctx.newValue === "number" ? ctx.newValue : 0)
        - (typeof ctx.oldValue === "number" ? ctx.oldValue : 0);
      const currentTotal = typeof ctx.targetEntity.properties.total_available_hours === "number"
        ? ctx.targetEntity.properties.total_available_hours : 0;
      return { targetProperty: "total_available_hours", value: currentTotal + delta };
    },
  },
];
