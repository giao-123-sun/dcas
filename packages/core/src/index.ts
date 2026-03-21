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

// Utils
export { generateId } from "./utils/id.js";
