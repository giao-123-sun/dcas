import type { LLMClient } from "./client.js";
import type { WorldGraph } from "../world-model/graph.js";
import type { EntityId, PropertyValue } from "../world-model/types.js";

export interface ExtractedEntity {
  type: string;
  properties: Record<string, PropertyValue>;
  /** Hint for matching to existing entities */
  matchHint?: string;
}

export interface ExtractedRelation {
  type: string;
  sourceIndex: number; // index into extracted entities array
  targetIndex: number;
  properties?: Record<string, PropertyValue>;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  raw?: unknown; // LLM raw response for debugging
}

/**
 * Extract structured entities and relations from unstructured text using LLM.
 *
 * @param client - LLM client (OpenRouter/Gemini)
 * @param text - Raw input text (document, description, etc.)
 * @param ontologyHints - List of expected entity types to guide extraction
 * @param domainContext - Optional domain-specific context for the LLM
 */
export async function extractEntitiesFromText(
  client: LLMClient,
  text: string,
  ontologyHints: string[],
  domainContext?: string,
): Promise<ExtractionResult> {
  const prompt = `${domainContext ? domainContext + "\n\n" : ""}You are a structured data extractor. Extract entities and relationships from the following text.

Expected entity types: ${ontologyHints.join(", ")}

Text to analyze:
"""
${text}
"""

Return a JSON object with:
{
  "entities": [
    {
      "type": "EntityType",
      "properties": { "key": "value", ... },
      "matchHint": "optional string to match against existing entities"
    }
  ],
  "relations": [
    {
      "type": "relation_type",
      "sourceIndex": 0,
      "targetIndex": 1,
      "properties": {}
    }
  ]
}

Rules:
- Entity types must be from the expected types list
- Properties should be key-value pairs with appropriate types (strings, numbers, booleans)
- Relations reference entities by their index in the entities array
- Extract ALL relevant entities and relationships mentioned in the text`;

  try {
    const result = await client.chatJSON<{
      entities: ExtractedEntity[];
      relations: ExtractedRelation[];
    }>([{ role: "user", content: prompt }]);

    // Validate indices
    const validRelations = (result.relations ?? []).filter(
      (r) => r.sourceIndex >= 0 && r.sourceIndex < result.entities.length &&
             r.targetIndex >= 0 && r.targetIndex < result.entities.length,
    );

    return {
      entities: result.entities ?? [],
      relations: validRelations,
      raw: result,
    };
  } catch (e) {
    console.warn("[entity-extractor] LLM extraction failed:", e instanceof Error ? e.message : e);
    return { entities: [], relations: [] };
  }
}

/**
 * Apply extracted entities and relations to a WorldGraph.
 * Returns a map from extraction index to created EntityId.
 */
export function applyExtractionToGraph(
  world: WorldGraph,
  extraction: ExtractionResult,
): Map<number, EntityId> {
  const idMap = new Map<number, EntityId>();

  // Create entities
  for (let i = 0; i < extraction.entities.length; i++) {
    const ext = extraction.entities[i];
    const entity = world.addEntity(ext.type, ext.properties);
    idMap.set(i, entity.id);
  }

  // Create relations
  for (const rel of extraction.relations) {
    const sourceId = idMap.get(rel.sourceIndex);
    const targetId = idMap.get(rel.targetIndex);
    if (sourceId && targetId) {
      world.addRelation(rel.type, sourceId, targetId, rel.properties ?? {});
    }
  }

  return idMap;
}

/**
 * Match extracted entities against existing entities in the graph.
 * Uses matchHint and type to find potential matches.
 * Returns a map from extraction index to existing EntityId (if matched).
 */
export function matchExistingEntities(
  world: WorldGraph,
  extraction: ExtractionResult,
): Map<number, EntityId> {
  const matches = new Map<number, EntityId>();

  for (let i = 0; i < extraction.entities.length; i++) {
    const ext = extraction.entities[i];
    if (!ext.matchHint) continue;

    // Search existing entities of the same type
    const existing = world.getEntitiesByType(ext.type);
    for (const entity of existing) {
      // Match by name, article, code, or other identifying properties
      const nameMatch = Object.values(entity.properties).some(
        (v) => typeof v === "string" && typeof ext.matchHint === "string" &&
               v.toLowerCase().includes(ext.matchHint.toLowerCase()),
      );
      if (nameMatch) {
        matches.set(i, entity.id);
        break;
      }
    }
  }

  return matches;
}

/**
 * Smart apply: match existing entities first, create only new ones.
 */
export function smartApplyExtraction(
  world: WorldGraph,
  extraction: ExtractionResult,
): { created: Map<number, EntityId>; matched: Map<number, EntityId> } {
  const matched = matchExistingEntities(world, extraction);
  const created = new Map<number, EntityId>();

  // Create only unmatched entities
  for (let i = 0; i < extraction.entities.length; i++) {
    if (matched.has(i)) continue;
    const ext = extraction.entities[i];
    const entity = world.addEntity(ext.type, ext.properties);
    created.set(i, entity.id);
  }

  // Build full ID map (matched + created)
  const allIds = new Map<number, EntityId>();
  for (const [idx, id] of matched) allIds.set(idx, id);
  for (const [idx, id] of created) allIds.set(idx, id);

  // Create relations
  for (const rel of extraction.relations) {
    const sourceId = allIds.get(rel.sourceIndex);
    const targetId = allIds.get(rel.targetIndex);
    if (sourceId && targetId) {
      world.addRelation(rel.type, sourceId, targetId, rel.properties ?? {});
    }
  }

  return { created, matched };
}
