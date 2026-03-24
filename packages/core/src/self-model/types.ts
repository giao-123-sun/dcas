import type { WorldGraph } from "../world-model/graph.js";
import type { PropertyValue } from "../world-model/types.js";

export interface SelfCapability {
  domain: string;
  taskType: string;
  proficiency: number;       // 0-1
  experienceCount: number;
}

export interface SelfResource {
  resourceType: "time" | "money" | "personnel" | "information" | "tool";
  name: string;
  available: number;
  capacity: number;
  unit: string;
}

export interface SelfBoundary {
  id: string;
  boundaryType: "ethical" | "legal" | "capability" | "resource";
  description: string;
  isAbsolute: boolean;
  check: (world: WorldGraph) => boolean;
}

export interface FeasibilityResult {
  feasible: boolean;
  score: number;             // 0-1
  issues: FeasibilityIssue[];
  mitigations: Mitigation[];
}

export interface FeasibilityIssue {
  type: "capability_gap" | "resource_shortage" | "time_constraint" | "boundary_violation" | "overload";
  severity: "blocker" | "high" | "medium" | "low";
  description: string;
  affectedAction?: string;
}

export interface Mitigation {
  type: "outsource" | "upskill" | "adjust_strategy" | "negotiate_deadline" | "add_resource";
  description: string;
  estimatedCost?: number;
  estimatedTimeImpact?: number;
}

export interface SkillRequirement {
  domain: string;
  taskType: string;
  minProficiency: number;
}

export interface StrategyRequirements {
  requiredSkills: SkillRequirement[];
  estimatedHours: number;
  estimatedCost: number;
}
