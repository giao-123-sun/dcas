export { ENTITY_TYPES, RELATION_TYPES } from "./ontology.js";
export type { CaseProperties, PartyProperties, JudgeProperties, StatuteProperties, EvidenceProperties, PrecedentProperties } from "./ontology.js";
export { seedLegalData } from "./seed-data.js";
export { legalCascadeRules } from "./cascade-rules.js";
export { generateLegalStrategies } from "./strategies.js";
export { createRecoveryPredictor, createCostPredictor } from "./predictions.js";
export { createLegalObjective } from "./objective.js";
