import type { SnapshotId } from "./types.js";
import { WorldGraph } from "./graph.js";
import { cloneEntity } from "./entity.js";
import { cloneRelation } from "./relation.js";
import { generateId } from "../utils/id.js";

/**
 * Create a deep copy fork of a WorldGraph.
 * The forked graph has a new SnapshotId — mutations to it do not affect the source.
 * Cascade rules are shared by reference (they are stateless functions).
 */
export function forkGraph(source: WorldGraph, label?: string): WorldGraph {
  const newSnapshotId = generateId() as SnapshotId;
  const forked = new WorldGraph(newSnapshotId, label);

  for (const entity of source.getAllEntities()) {
    forked.importEntity(cloneEntity(entity, newSnapshotId));
  }

  for (const relation of source.getAllRelations()) {
    forked.importRelation(cloneRelation(relation, newSnapshotId));
  }

  forked.setCascadeRules(source.getCascadeRules());

  return forked;
}
