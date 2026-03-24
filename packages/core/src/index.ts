// DCAS Core — Public API

// Configuration
export type { DCASConfig, DeepPartial } from "./config.js";
export { DEFAULT_CONFIG, mergeConfig } from "./config.js";

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
export { EventLog } from "./world-model/event-log.js";
export type { StateEvent } from "./world-model/event-log.js";
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
export { GradientBoostModel } from "./prediction/models/gradient-boost.js";
export type { GBFeature, TrainingSample, GradientBoostConfig } from "./prediction/models/gradient-boost.js";
export { AdversaryModel } from "./prediction/models/adversary.js";
export type { AdversaryProfile } from "./prediction/models/adversary.js";

// Self-Model
export { SelfModel } from "./self-model/self-model.js";
export { checkFeasibility, suggestMitigations } from "./self-model/feasibility.js";
export { selfModelCascadeRules } from "./self-model/cascade-rules.js";
export type {
  SelfCapability, SelfResource, SelfBoundary,
  FeasibilityResult, FeasibilityIssue, Mitigation,
  SkillRequirement, StrategyRequirements,
} from "./self-model/types.js";

// L4: Simulation & Strategy
export type {
  Action,
  ConditionalAction,
  Strategy,
  SimulationResult,
  RiskProfile,
  RankedStrategies,
  RankedStrategy,
  MonteCarloConfig,
} from "./simulation/types.js";
export { simulateStrategy } from "./simulation/simulator.js";
export { compareStrategies, simulateAll } from "./simulation/comparator.js";

// Sampler utilities
export {
  createSeededRng,
  sampleNormal,
  sampleEmpirical,
  sampleFromDistribution,
  coefficientOfVariation,
  empiricalDistribution,
} from "./prediction/sampler.js";

// L4: LLM Strategy Generator
export { generateStrategiesWithLLM } from "./simulation/llm-generator.js";

// LLM Client
export { LLMClient, createLLMClientFromEnv } from "./llm/client.js";
export type { LLMConfig, LLMMessage, LLMResponse } from "./llm/client.js";
export { serializeWorldForLLM, serializeObjectiveForLLM } from "./llm/world-serializer.js";
export { LLMPredictionModel } from "./prediction/models/llm.js";
export { extractEntitiesFromText, applyExtractionToGraph, matchExistingEntities, smartApplyExtraction } from "./llm/entity-extractor.js";
export type { ExtractedEntity, ExtractedRelation, ExtractionResult } from "./llm/entity-extractor.js";

// MetaClaw Integration
export type {
  MetaClawSkill,
  DCASMetadata,
  MetaClawFeedback,
  SkillIndex,
  SkillIndexEntry,
} from "./metaclaw/types.js";
export { translateToSkill, validateSkill } from "./metaclaw/translator.js";
export { SkillManager } from "./metaclaw/skill-manager.js";
export type { SkillFileSystem } from "./metaclaw/skill-manager.js";
export { processFeedback } from "./metaclaw/feedback.js";
export type { LearningSignal } from "./metaclaw/feedback.js";

// L5: Memory & Learning
export type {
  WorldSnapshot,
  DecisionRecord,
  DecisionOutcome,
  Pattern,
  PatternCondition,
  LearningUpdate,
} from "./memory/types.js";
export { DecisionStore } from "./memory/decision-store.js";
export { PatternMemory } from "./memory/pattern.js";
export { learnFromOutcome, analyzeDecisionHistory } from "./memory/learning.js";

// L6: Decision Loop Controller
export { DecisionLoopController } from "./loop/controller.js";
export type {
  ControllerMode,
  ControllerConfig,
  Alert,
  ControllerAction,
} from "./loop/controller.js";

// Storage adapters
export { SQLiteDecisionStore, SQLitePatternMemory } from "./storage/sqlite-adapter.js";

// Utils
export { generateId } from "./utils/id.js";

// i18n
export { setLocale, getLocale, zh, en } from "./i18n/index.js";
export type { Locale } from "./i18n/index.js";
