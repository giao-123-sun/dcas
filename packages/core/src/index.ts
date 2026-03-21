// DCAS Core — Public API

// Types
export type {
  EntityId,
  RelationId,
  SnapshotId,
  EntityType,
  RelationType,
  PropertyValue,
  Entity,
  EntityMeta,
  Relation,
  RelationMeta,
  CascadeRule,
  CascadeEffect,
  CascadeEffectResult,
  CascadeContext,
  PropertyDiff,
  ChangeResult,
  Neighbor,
} from "./world-model/types.js";

// World Model
export { WorldGraph } from "./world-model/graph.js";
export { forkGraph } from "./world-model/fork.js";
export { createEntity, cloneEntity, setProperty } from "./world-model/entity.js";
export { createRelation, cloneRelation } from "./world-model/relation.js";
export { applyCascade } from "./world-model/cascade.js";

// L2: Objective Function
export type {
  KPI,
  KPIResult,
  Constraint,
  ConstraintResult,
  Tradeoff,
  ObjectiveSpec,
  ObjectiveResult,
} from "./objective/types.js";
export { evaluateObjective, compareWorlds } from "./objective/objective.js";

// L3: Prediction Engine
export type {
  ProbabilityDistribution,
  PredictionContext,
  PredictionAction,
  PredictionModel,
  EnsemblePrediction,
} from "./prediction/types.js";
export {
  normalDistribution,
  skewedDistribution,
  pointEstimate,
  ensembleDistributions,
} from "./prediction/distribution.js";
export { PredictionEngine } from "./prediction/engine.js";
export { HeuristicModel } from "./prediction/models/heuristic.js";
export type { HeuristicRule } from "./prediction/models/heuristic.js";
export { StatisticalModel } from "./prediction/models/statistical.js";
export type { Feature } from "./prediction/models/statistical.js";

// L4: Simulation & Strategy
export type {
  Action,
  ConditionalAction,
  Strategy,
  SimulationResult,
  RiskProfile,
  RankedStrategies,
  RankedStrategy,
} from "./simulation/types.js";
export { simulateStrategy } from "./simulation/simulator.js";
export { compareStrategies, simulateAll } from "./simulation/comparator.js";

// Utils
export { generateId } from "./utils/id.js";
