import { HeuristicModel } from "@dcas/core";
import type { HeuristicRule } from "@dcas/core";

const sharpeRules: HeuristicRule[] = [
  {
    description: "Defensive rebalance in rate hike scenario",
    condition: (ctx) => {
      const p = ctx.world.getEntitiesByType("Portfolio")[0];
      return ((p?.properties.max_drawdown as number) ?? 0) < 0.15 && ((p?.properties.cash_ratio as number) ?? 0) >= 0.08;
    },
    predict: () => ({ mean: 1.25, std: 0.15, confidence: 0.7 }),
  },
  {
    description: "Aggressive growth in bull market",
    condition: (ctx) => {
      const p = ctx.world.getEntitiesByType("Portfolio")[0];
      return ((p?.properties.current_sharpe as number) ?? 0) > 1.4;
    },
    predict: () => ({ mean: 1.50, std: 0.25, confidence: 0.55 }),
  },
  {
    description: "Default balanced",
    condition: () => true,
    predict: () => ({ mean: 1.30, std: 0.18, confidence: 0.65 }),
  },
];

export function createSharpePredictor(): HeuristicModel {
  return new HeuristicModel("inv_sharpe", "current_sharpe", sharpeRules, { mean: 1.2, std: 0.2, confidence: 0.5 });
}

const drawdownRules: HeuristicRule[] = [
  {
    description: "High tech weight → high drawdown risk",
    condition: (ctx) => {
      const p = ctx.world.getEntitiesByType("Portfolio")[0];
      return ((p?.properties.tech_weight as number) ?? 0) > 0.40;
    },
    predict: () => ({ mean: 0.20, std: 0.05, confidence: 0.65 }),
  },
  {
    description: "Defensive positioning → low drawdown",
    condition: (ctx) => {
      const p = ctx.world.getEntitiesByType("Portfolio")[0];
      return ((p?.properties.defensive_weight as number) ?? 0) > 0.20;
    },
    predict: () => ({ mean: 0.10, std: 0.03, confidence: 0.7 }),
  },
  {
    description: "Default drawdown",
    condition: () => true,
    predict: () => ({ mean: 0.15, std: 0.04, confidence: 0.6 }),
  },
];

export function createDrawdownPredictor(): HeuristicModel {
  return new HeuristicModel("inv_drawdown", "max_drawdown", drawdownRules, { mean: 0.15, std: 0.05, confidence: 0.5 });
}
