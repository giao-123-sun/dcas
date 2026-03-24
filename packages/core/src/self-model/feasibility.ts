import type { Strategy, Action } from "../simulation/types.js";
import type { SelfModel } from "./self-model.js";
import type { WorldGraph } from "../world-model/graph.js";
import type { FeasibilityResult, FeasibilityIssue, Mitigation, StrategyRequirements } from "./types.js";

/**
 * Check whether a strategy is feasible given the Self-Model constraints.
 */
export function checkFeasibility(
  strategy: Strategy,
  selfModel: SelfModel,
  world: WorldGraph,
  requirements?: StrategyRequirements,
): FeasibilityResult {
  const issues: FeasibilityIssue[] = [];

  // 1. Capability check
  if (requirements?.requiredSkills) {
    const gaps = selfModel.getCapabilityGaps(requirements.requiredSkills);
    for (const gap of gaps) {
      issues.push({
        type: "capability_gap",
        severity: "high",
        description: `Team lacks capability: ${gap}`,
      });
    }
  }

  // 2. Resource check (time)
  if (requirements?.estimatedHours) {
    const available = selfModel.getAvailableHours();
    if (requirements.estimatedHours > available * 1.2) {
      issues.push({
        type: "resource_shortage",
        severity: requirements.estimatedHours > available * 2 ? "blocker" : "high",
        description: `Need ${requirements.estimatedHours}h but only ${available}h available`,
      });
    } else if (requirements.estimatedHours > available * 0.8) {
      issues.push({
        type: "resource_shortage",
        severity: "medium",
        description: `Tight schedule: ${requirements.estimatedHours}h needed, ${available}h available`,
      });
    }
  }

  // 3. Overload check
  if (selfModel.isOverloaded()) {
    issues.push({
      type: "overload",
      severity: "high",
      description: `Team is overloaded (utilization ${(selfModel.getUtilizationRate() * 100).toFixed(0)}%)`,
    });
  }

  // 4. Boundary check
  const self = selfModel.getSelfEntity();
  if (self) {
    // Check capability boundaries via CapabilityGap entities
    const gapEntities = world.getEntitiesByType("CapabilityGap");
    for (const gap of gapEntities) {
      const area = gap.properties.area as string;
      // Check if strategy actions reference this gap area
      const strategyText = JSON.stringify(strategy);
      if (strategyText.includes(area)) {
        issues.push({
          type: "boundary_violation",
          severity: (gap.properties.severity as string) === "critical" ? "blocker" : "medium",
          description: `Strategy involves ${area} which is a known capability gap`,
        });
      }
    }
  }

  // Calculate feasibility score
  const blockers = issues.filter(i => i.severity === "blocker").length;
  const highs = issues.filter(i => i.severity === "high").length;
  const mediums = issues.filter(i => i.severity === "medium").length;

  const feasible = blockers === 0;
  const score = feasible
    ? Math.max(0, 1 - highs * 0.2 - mediums * 0.05)
    : 0;

  // Generate mitigations
  const mitigations = suggestMitigations(issues, selfModel);

  return { feasible, score, issues, mitigations };
}

/**
 * Suggest mitigations for feasibility issues.
 */
export function suggestMitigations(
  issues: FeasibilityIssue[],
  selfModel: SelfModel,
): Mitigation[] {
  const mitigations: Mitigation[] = [];

  for (const issue of issues) {
    switch (issue.type) {
      case "capability_gap":
        mitigations.push({
          type: "outsource",
          description: `Outsource the task requiring: ${issue.description}`,
          estimatedCost: 5000,
          estimatedTimeImpact: 5,
        });
        mitigations.push({
          type: "adjust_strategy",
          description: "Modify strategy to avoid this capability requirement",
        });
        break;

      case "resource_shortage":
        mitigations.push({
          type: "negotiate_deadline",
          description: "Negotiate extended timeline with stakeholder",
          estimatedTimeImpact: 14,
        });
        mitigations.push({
          type: "add_resource",
          description: "Hire temporary support or reassign from other projects",
          estimatedCost: 10000,
        });
        break;

      case "overload":
        mitigations.push({
          type: "negotiate_deadline",
          description: "Delay non-critical tasks to free up capacity",
        });
        break;

      case "boundary_violation":
        if (issue.severity !== "blocker") {
          mitigations.push({
            type: "outsource",
            description: `Partner with specialist for: ${issue.description}`,
            estimatedCost: 8000,
          });
        }
        break;

      case "time_constraint":
        mitigations.push({
          type: "negotiate_deadline",
          description: "Request deadline extension",
          estimatedTimeImpact: 7,
        });
        break;
    }
  }

  return mitigations;
}
