export const ENTITY_TYPES = {
  Account: "Account", Post: "Post", Audience: "Audience",
  Competitor: "Competitor", Platform: "Platform", ContentPlan: "ContentPlan",
} as const;

export const RELATION_TYPES = {
  owns: "owns", targets: "targets", competes_with: "competes_with",
  published_on: "published_on", has_plan: "has_plan",
} as const;

export interface AccountProperties { name: string; followers: number; engagement_rate: number; monthly_growth_rate: number; niche: string; }
export interface CompetitorProperties { name: string; followers: number; engagement_rate: number; strategy: string; recent_trend: string; }
export interface AudienceProperties { size: number; active_ratio: number; preferred_content_types: string[]; }
export interface PlatformProperties { name: string; algorithm_preference: string; content_weight_bonus: number; }
