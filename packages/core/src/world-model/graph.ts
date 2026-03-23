import type {
  CascadeRule,
  ChangeResult,
  Entity,
  EntityId,
  EntityType,
  Neighbor,
  PropertyDiff,
  PropertyValue,
  Relation,
  RelationId,
  RelationType,
  SnapshotId,
} from "./types.js";
import { createEntity } from "./entity.js";
import { createRelation } from "./relation.js";
import { applyCascade } from "./cascade.js";
import { generateId } from "../utils/id.js";

export class WorldGraph {
  // --- Storage ---
  private entities = new Map<EntityId, Entity>();
  private relations = new Map<RelationId, Relation>();

  // --- Indexes ---
  private outgoing = new Map<EntityId, Set<RelationId>>();
  private incoming = new Map<EntityId, Set<RelationId>>();
  private byType = new Map<EntityType, Set<EntityId>>();

  // --- Cascade rules ---
  private cascadeRules: CascadeRule[] = [];

  // --- Identity ---
  readonly snapshotId: SnapshotId;
  readonly label?: string;

  constructor(snapshotId?: SnapshotId, label?: string) {
    this.snapshotId = snapshotId ?? (generateId() as SnapshotId);
    this.label = label;
  }

  // ============================================================
  // Entity operations
  // ============================================================

  addEntity(type: EntityType, properties: Record<string, PropertyValue> = {}): Entity {
    const entity = createEntity(type, properties, this.snapshotId);
    this.insertEntity(entity);
    return entity;
  }

  /** Import a pre-built entity (used by fork) */
  importEntity(entity: Entity): void {
    this.insertEntity(entity);
  }

  getEntity(id: EntityId): Entity | undefined {
    return this.entities.get(id);
  }

  getEntitiesByType(type: EntityType): Entity[] {
    const ids = this.byType.get(type);
    if (!ids) return [];
    return [...ids].map((id) => this.entities.get(id)).filter((e): e is Entity => e !== undefined);
  }

  getAllEntities(): Entity[] {
    return [...this.entities.values()];
  }

  removeEntity(id: EntityId): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Remove all connected relations
    const relIds = new Set<RelationId>();
    for (const rid of this.outgoing.get(id) ?? []) relIds.add(rid);
    for (const rid of this.incoming.get(id) ?? []) relIds.add(rid);
    for (const rid of relIds) {
      this.removeRelation(rid);
    }

    // Remove from type index
    this.byType.get(entity.type)?.delete(id);

    // Remove adjacency entries
    this.outgoing.delete(id);
    this.incoming.delete(id);

    // Remove entity
    this.entities.delete(id);
    return true;
  }

  get entityCount(): number {
    return this.entities.size;
  }

  // ============================================================
  // Relation operations
  // ============================================================

  addRelation(
    type: RelationType,
    sourceId: EntityId,
    targetId: EntityId,
    properties: Record<string, PropertyValue> = {},
  ): Relation {
    if (!this.entities.has(sourceId)) {
      throw new Error(`Source entity ${sourceId} not found`);
    }
    if (!this.entities.has(targetId)) {
      throw new Error(`Target entity ${targetId} not found`);
    }

    const relation = createRelation(type, sourceId, targetId, properties, this.snapshotId);
    this.insertRelation(relation);
    return relation;
  }

  /** Import a pre-built relation (used by fork) */
  importRelation(relation: Relation): void {
    this.insertRelation(relation);
  }

  getRelation(id: RelationId): Relation | undefined {
    return this.relations.get(id);
  }

  getAllRelations(): Relation[] {
    return [...this.relations.values()];
  }

  removeRelation(id: RelationId): boolean {
    const relation = this.relations.get(id);
    if (!relation) return false;

    this.outgoing.get(relation.sourceId)?.delete(id);
    this.incoming.get(relation.targetId)?.delete(id);
    this.relations.delete(id);
    return true;
  }

  get relationCount(): number {
    return this.relations.size;
  }

  // ============================================================
  // Graph traversal
  // ============================================================

  getNeighbors(
    entityId: EntityId,
    direction: "outgoing" | "incoming" | "both",
    relationTypes?: RelationType[],
  ): Neighbor[] {
    const result: Neighbor[] = [];
    const typeSet = relationTypes ? new Set(relationTypes) : null;

    if (direction === "outgoing" || direction === "both") {
      for (const rid of this.outgoing.get(entityId) ?? []) {
        const relation = this.relations.get(rid);
        if (!relation) continue;
        if (typeSet && !typeSet.has(relation.type)) continue;
        const entity = this.entities.get(relation.targetId);
        if (entity) result.push({ relation, entity });
      }
    }

    if (direction === "incoming" || direction === "both") {
      for (const rid of this.incoming.get(entityId) ?? []) {
        const relation = this.relations.get(rid);
        if (!relation) continue;
        if (typeSet && !typeSet.has(relation.type)) continue;
        const entity = this.entities.get(relation.sourceId);
        if (entity) result.push({ relation, entity });
      }
    }

    return result;
  }

  // ============================================================
  // Property mutation (with cascade)
  // ============================================================

  updateProperty(entityId: EntityId, key: string, value: PropertyValue): ChangeResult {
    const entity = this.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity ${entityId} not found`);
    }

    const oldValue = entity.properties[key] ?? null;

    // Skip if unchanged
    if (oldValue === value) {
      return { diffs: [], cascadeCount: 0 };
    }

    // Apply direct change
    entity.properties[key] = value;
    entity.meta.updatedAt = Date.now();

    const directDiff: PropertyDiff = {
      entityId,
      property: key,
      oldValue,
      newValue: value,
      cause: "direct",
      depth: 0,
    };

    // Run cascade
    const cascadeDiffs = applyCascade(
      this,
      { entityId, property: key, oldValue, newValue: value },
      this.cascadeRules,
    );

    return {
      diffs: [directDiff, ...cascadeDiffs],
      cascadeCount: cascadeDiffs.length,
    };
  }

  // ============================================================
  // Cascade rule management
  // ============================================================

  addCascadeRule(rule: CascadeRule): void {
    this.cascadeRules.push(rule);
  }

  getCascadeRules(): CascadeRule[] {
    return this.cascadeRules;
  }

  setCascadeRules(rules: CascadeRule[]): void {
    this.cascadeRules = rules;
  }

  // ============================================================
  // Private helpers
  // ============================================================

  private insertEntity(entity: Entity): void {
    this.entities.set(entity.id, entity);

    // Type index
    if (!this.byType.has(entity.type)) {
      this.byType.set(entity.type, new Set());
    }
    this.byType.get(entity.type)!.add(entity.id);

    // Ensure adjacency maps exist
    if (!this.outgoing.has(entity.id)) {
      this.outgoing.set(entity.id, new Set());
    }
    if (!this.incoming.has(entity.id)) {
      this.incoming.set(entity.id, new Set());
    }
  }

  private insertRelation(relation: Relation): void {
    this.relations.set(relation.id, relation);

    if (!this.outgoing.has(relation.sourceId)) {
      this.outgoing.set(relation.sourceId, new Set());
    }
    this.outgoing.get(relation.sourceId)!.add(relation.id);

    if (!this.incoming.has(relation.targetId)) {
      this.incoming.set(relation.targetId, new Set());
    }
    this.incoming.get(relation.targetId)!.add(relation.id);
  }
}
