import type { CascadeRule, EntityId, PropertyDiff, PropertyValue } from "./types.js";
import type { WorldGraph } from "./graph.js";

/**
 * Apply cascade propagation starting from a property change.
 * Uses a visited set keyed by "entityId:property" to prevent infinite loops.
 */
export function applyCascade(
  graph: WorldGraph,
  trigger: {
    entityId: EntityId;
    property: string;
    oldValue: PropertyValue;
    newValue: PropertyValue;
  },
  rules: CascadeRule[],
): PropertyDiff[] {
  const diffs: PropertyDiff[] = [];
  const visited = new Set<string>();

  function propagate(
    entityId: EntityId,
    property: string,
    oldValue: PropertyValue,
    newValue: PropertyValue,
    depth: number,
  ): void {
    const key = `${entityId}\0${property}`;
    if (visited.has(key)) return;
    visited.add(key);

    const entity = graph.getEntity(entityId);
    if (!entity) return;

    for (const rule of rules) {
      if (rule.sourceType !== entity.type) continue;
      if (rule.sourceProperty !== property) continue;
      if (depth >= rule.maxDepth) continue;

      const neighbors = graph.getNeighbors(entityId, rule.direction, rule.relationTypes);

      for (const { relation, entity: target } of neighbors) {
        const result = rule.effect({
          sourceEntity: entity,
          targetEntity: target,
          relation,
          changedProperty: property,
          oldValue,
          newValue,
          depth,
        });

        if (result === undefined) continue;

        const { targetProperty, value } = result;
        const old = target.properties[targetProperty] ?? null;

        // Skip if value unchanged
        if (old === value) continue;

        // Ensure COW: if the target is a shared reference from a parent fork,
        // clone it before mutating so the parent graph is not affected.
        const ownedTarget = graph._ensureEntityOwned(target.id);
        if (!ownedTarget) continue; // Entity disappeared during cascade — skip
        ownedTarget.properties[targetProperty] = value;
        ownedTarget.meta.updatedAt = Date.now();

        const diff: PropertyDiff = {
          entityId: ownedTarget.id,
          property: targetProperty,
          oldValue: old,
          newValue: value,
          cause: "cascade",
          depth: depth + 1,
        };
        diffs.push(diff);

        // Recurse
        propagate(ownedTarget.id, targetProperty, old, value, depth + 1);
      }
    }
  }

  propagate(trigger.entityId, trigger.property, trigger.oldValue, trigger.newValue, 0);
  return diffs;
}
