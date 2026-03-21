import type { EntityId, PropertyValue, Relation, RelationId, RelationType, SnapshotId } from "./types.js";
import { generateId } from "../utils/id.js";

export function createRelation(
  type: RelationType,
  sourceId: EntityId,
  targetId: EntityId,
  properties: Record<string, PropertyValue>,
  snapshotId: SnapshotId,
): Relation {
  return {
    id: generateId() as RelationId,
    type,
    sourceId,
    targetId,
    properties: { ...properties },
    meta: { createdAt: Date.now(), snapshotId },
  };
}

export function cloneRelation(relation: Relation, newSnapshotId: SnapshotId): Relation {
  return {
    ...relation,
    properties: structuredClone(relation.properties),
    meta: { ...relation.meta, snapshotId: newSnapshotId },
  };
}
