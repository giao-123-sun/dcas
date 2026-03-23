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
import { EventLog } from "./event-log.js";
import type { StateEvent } from "./event-log.js";

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

  // --- Event log ---
  private eventLog = new EventLog();

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

  /**
   * Ensure this graph owns its own copy of an entity (Copy-on-Write).
   * If the entity's snapshotId differs from this graph's snapshotId, it was
   * shared from a parent fork — clone only that entity before mutating.
   *
   * Internal use: also called by cascade.ts to protect shared references.
   * @internal
   */
  _ensureEntityOwned(entityId: EntityId): Entity | undefined {
    const entity = this.entities.get(entityId);
    if (!entity) return undefined;

    // If this entity belongs to a parent snapshot, clone it for COW
    if (entity.meta.snapshotId !== this.snapshotId) {
      const owned: Entity = {
        ...entity,
        properties: structuredClone(entity.properties),
        meta: { ...entity.meta, snapshotId: this.snapshotId },
      };
      this.entities.set(entityId, owned);
      return owned;
    }
    return entity;
  }

  private ensureEntityOwned(entityId: EntityId): Entity {
    const entity = this._ensureEntityOwned(entityId);
    if (!entity) throw new Error(`Entity ${entityId} not found`);
    return entity;
  }

  updateProperty(entityId: EntityId, key: string, value: PropertyValue): ChangeResult {
    const entity = this.ensureEntityOwned(entityId);

    const oldValue = entity.properties[key] ?? null;

    // Skip if unchanged
    if (oldValue === value) {
      return { diffs: [], cascadeCount: 0 };
    }

    // Apply direct change
    entity.properties[key] = value;
    entity.meta.updatedAt = Date.now();

    // Record direct event
    const directEvent = this.eventLog.append({
      entityId,
      property: key,
      oldValue,
      newValue: value,
      cause: "direct",
      branchId: this.snapshotId,
    });

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

    // Record cascade events
    for (const diff of cascadeDiffs) {
      this.eventLog.append({
        entityId: diff.entityId,
        property: diff.property,
        oldValue: diff.oldValue,
        newValue: diff.newValue,
        cause: "cascade",
        sourceEventId: directEvent.id,
        branchId: this.snapshotId,
      });
    }

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
  // Event log access
  // ============================================================

  /** Returns the full event log for this graph. */
  getEventLog(): EventLog {
    return this.eventLog;
  }

  /** Returns all events recorded for the given entity. */
  getEventsForEntity(entityId: EntityId): StateEvent[] {
    return this.eventLog.getEventsForEntity(entityId);
  }

  // ============================================================
  // Time travel
  // ============================================================

  /**
   * Get the value of an entity property at a specific point in time.
   * Replays event log to find the value at the given timestamp.
   */
  getPropertyAt(entityId: EntityId, property: string, timestamp: number): PropertyValue | undefined {
    // All events for this entity+property, sorted chronologically
    const allEvents = this.eventLog.getEventsForEntity(entityId)
      .filter(e => e.property === property)
      .sort((a, b) => a.timestamp - b.timestamp);

    if (allEvents.length === 0) {
      // No events ever — return current value
      const entity = this.getEntity(entityId);
      return entity?.properties[property];
    }

    // Find the latest event whose timestamp <= requested timestamp
    const eventsAtOrBefore = allEvents.filter(e => e.timestamp <= timestamp);

    if (eventsAtOrBefore.length > 0) {
      // Return the newValue of the most recent applicable event
      return eventsAtOrBefore[eventsAtOrBefore.length - 1].newValue;
    }

    // Timestamp is before any event — return the oldValue of the first event
    // (i.e., the value the property had before any change was recorded)
    return allEvents[0].oldValue;
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
