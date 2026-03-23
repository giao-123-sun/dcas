import type { SnapshotId } from "./types.js";
import { WorldGraph } from "./graph.js";
import { generateId } from "../utils/id.js";

/**
 * Create a Copy-on-Write fork of a WorldGraph.
 * The forked graph shares entity/relation object references with the source.
 * On the first write to any entity in the fork, only that entity is cloned
 * (ensureEntityOwned in graph.ts detects snapshotId mismatch and clones lazily).
 * Cascade rules are shared by reference (they are stateless functions).
 */
export function forkGraph(source: WorldGraph, label?: string): WorldGraph {
  const newSnapshotId = generateId() as SnapshotId;
  const forked = new WorldGraph(newSnapshotId, label);

  // Share entity references (NOT deep clone) — CoW handled on first write
  for (const entity of source.getAllEntities()) {
    forked.importEntity(entity);
  }

  // Share relation references
  for (const relation of source.getAllRelations()) {
    forked.importRelation(relation);
  }

  // Share cascade rules (stateless, already shared by reference)
  forked.setCascadeRules(source.getCascadeRules());

  return forked;
}
