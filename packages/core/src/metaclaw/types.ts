// ============================================================
// MetaClaw Integration — Type Definitions
// (Follows DCAS_MetaClaw_Skill_Spec.md)
// ============================================================

/**
 * MetaClaw native Skill format.
 */
export interface MetaClawSkill {
  name: string;
  instruction: string;
  tags: string[];
  created_at: string;
  source: "dcas" | "auto_evolve" | "manual";
  priority?: "high" | "medium" | "low";
  dcas_metadata?: DCASMetadata;
}

export interface DCASMetadata {
  strategy_id: string;
  objective: {
    primary_kpi: string;
    direction: "maximize" | "minimize";
    target?: number;
    confidence: number;
  };
  world_context: {
    case_type?: string;
    key_entities: string[];
    risk_level: "high" | "medium" | "low";
  };
  simulation_summary?: {
    strategies_evaluated: number;
    this_strategy_rank: number;
    expected_kpi: {
      mean: number;
      p25: number;
      p75: number;
      confidence: number;
    };
  };
  expiry?: string;
  version: number;
  supersedes?: string;
}

/**
 * MetaClaw → DCAS feedback packet.
 */
export interface MetaClawFeedback {
  feedback_id: string;
  session_id: string;
  timestamp: string;
  dcas_strategy_id: string;
  execution_summary: {
    total_turns: number;
    avg_reward: number;
    completion_status: "success" | "partial" | "failed";
    duration_seconds: number;
  };
  outcome?: {
    achieved: boolean;
    actual_value: number;
    predicted_value: number;
    deviation: number;
  };
  new_skills_generated: Array<{
    name: string;
    instruction: string;
    source: string;
  }>;
  anomalies: Array<{
    type: string;
    description: string;
    possible_cause: string;
  }>;
}

/**
 * Skill index entry (stored in index.json).
 */
export interface SkillIndexEntry {
  name: string;
  current_version: number;
  status: "active" | "superseded" | "expired" | "archived";
  file: string;
  created_at: string;
  last_feedback?: string;
  feedback_count: number;
  avg_execution_reward: number;
  total_uses: number;
}

export interface SkillIndex {
  skills: SkillIndexEntry[];
  last_sync: string;
}
