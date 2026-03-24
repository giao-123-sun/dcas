export const ENTITY_TYPES = {
  Portfolio: "Portfolio",
  Asset: "Asset",
  Sector: "Sector",
  MacroFactor: "MacroFactor",
} as const;

export const RELATION_TYPES = {
  holds: "holds",
  belongs_to_sector: "belongs_to_sector",
  sensitive_to: "sensitive_to",
} as const;

export interface PortfolioProperties {
  name: string;
  total_value: number;
  cash_ratio: number;
  current_sharpe: number;
  max_drawdown: number;
}

export interface AssetProperties {
  name: string;
  ticker: string;
  sector: string;
  weight: number; // 0-1 portfolio weight
  expected_return: number; // annualized
  volatility: number;
  beta: number; // sensitivity to market
}

export interface SectorProperties {
  name: string;
  total_weight: number;
  outlook: "bullish" | "neutral" | "bearish";
}

export interface MacroFactorProperties {
  name: string;
  current_value: number;
  scenario: string; // "rate_hike" | "recession" | "mild_growth"
  probability: number;
}
