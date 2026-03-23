/**
 * Legal domain entity type definitions and helpers.
 */

export const ENTITY_TYPES = {
  Case: "Case",
  Party: "Party",
  Judge: "Judge",
  Statute: "Statute",
  Evidence: "Evidence",
  Precedent: "Precedent",
  Budget: "Budget",
} as const;

export const RELATION_TYPES = {
  plaintiff_in: "plaintiff_in",
  defendant_in: "defendant_in",
  decided_by: "decided_by",
  cites: "cites",
  has_evidence: "has_evidence",
  has_budget: "has_budget",
  interprets: "interprets",
} as const;

export interface CaseProperties {
  case_type: string;
  sub_type?: string;
  claim_amount: number;
  strategy: string;
  expected_recovery: number;
  expected_cost: number;
  duration_months: number;
  evidence_strength: number;
  base_win_probability?: number;
  risk_level?: string;
  status: string;
}

export interface PartyProperties {
  name: string;
  type: "individual" | "corporation";
  role: "plaintiff" | "defendant";
}

export interface JudgeProperties {
  name: string;
  pro_labor_rate: number;
  avg_cycle_days: number;
  total_cases: number;
}

export interface StatuteProperties {
  code: string;
  article: string;
  description: string;
  compensation_rule?: string;
}

export interface EvidenceProperties {
  type: string;
  description: string;
  strength: number; // 0-10
}

export interface PrecedentProperties {
  case_type: string;
  outcome: "plaintiff_wins" | "defendant_wins" | "settled";
  awarded_amount: number;
  description: string;
}
