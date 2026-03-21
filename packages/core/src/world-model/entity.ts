import type { Entity, EntityId, EntityType, PropertyValue, SnapshotId } from "./types.js";
import { generateId } from "../utils/id.js";

export function createEntity(
  type: EntityType,
  properties: Record<string, PropertyValue>,
  snapshotId: SnapshotId,
): Entity {
  const now = Date.now();
  return {
    id: generateId() as EntityId,
    type,
    properties: { ...properties },
    meta: { createdAt: now, updatedAt: now, snapshotId },
  };
}

export function cloneEntity(entity: Entity, newSnapshotId: SnapshotId): Entity {
  return {
    ...entity,
    properties: structuredClone(entity.properties),
    meta: { ...entity.meta, snapshotId: newSnapshotId },
  };
}

export function setProperty(
  entity: Entity,
  key: string,
  value: PropertyValue,
): { oldValue: PropertyValue; newValue: PropertyValue } {
  const oldValue = entity.properties[key] ?? null;
  entity.properties[key] = value;
  entity.meta.updatedAt = Date.now();
  return { oldValue, newValue: value };
}
