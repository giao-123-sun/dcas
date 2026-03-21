// ============================================================
// DCAS L1: World Model — Core Type Definitions
// ============================================================

// --- Branded ID types (compile-time safety) ---

declare const __entityId: unique symbol;
declare const __relationId: unique symbol;
declare const __snapshotId: unique symbol;

export type EntityId = string & { readonly [__entityId]: true };
export type RelationId = string & { readonly [__relationId]: true };
export type SnapshotId = string & { readonly [__snapshotId]: true };

// --- Domain-defined tags ---

export type EntityType = string;
export type RelationType = string;

// --- Property value (recursive JSON-like union) ---

export type PropertyValue =
  | string
  | number
  | boolean
  | null
  | PropertyValue[]
  | { [key: string]: PropertyValue };

// --- Entity ---

export interface EntityMeta {
  createdAt: number;
  updatedAt: number;
  snapshotId: SnapshotId;
}

export interface Entity {
  readonly id: EntityId;
  readonly type: EntityType;
  properties: Record<string, PropertyValue>;
  meta: EntityMeta;
}

// --- Relation ---

export interface RelationMeta {
  createdAt: number;
  snapshotId: SnapshotId;
}

export interface Relation {
  readonly id: RelationId;
  readonly type: RelationType;
  readonly sourceId: EntityId;
  readonly targetId: EntityId;
  properties: Record<string, PropertyValue>;
  meta: RelationMeta;
}

// --- Cascade ---

export interface CascadeContext {
  sourceEntity: Entity;
  targetEntity: Entity;
  relation: Relation;
  changedProperty: string;
  oldValue: PropertyValue;
  newValue: PropertyValue;
  depth: number;
}

export interface CascadeEffectResult {
  targetProperty: string;
  value: PropertyValue;
}

export type CascadeEffect = (ctx: CascadeContext) => CascadeEffectResult | undefined;

export interface CascadeRule {
  /** Which entity type triggers this rule */
  sourceType: EntityType;
  /** Which property change triggers this rule */
  sourceProperty: string;
  /** Which relation types to traverse */
  relationTypes: RelationType[];
  /** Direction of traversal */
  direction: "outgoing" | "incoming" | "both";
  /** Effect function */
  effect: CascadeEffect;
  /** Max propagation depth (prevents infinite loops) */
  maxDepth: number;
}

// --- Change tracking ---

export interface PropertyDiff {
  entityId: EntityId;
  property: string;
  oldValue: PropertyValue;
  newValue: PropertyValue;
  cause: "direct" | "cascade";
  depth: number;
}

export interface ChangeResult {
  diffs: PropertyDiff[];
  cascadeCount: number;
}

// --- Neighbor query result ---

export interface Neighbor {
  relation: Relation;
  entity: Entity;
}
