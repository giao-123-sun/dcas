import type { ObjectiveSpec } from "@dcas/core";

export function createInvestmentObjective(): ObjectiveSpec {
  return {
    kpis: [
      {
        id: "sharpe",
        name: "Sharpe Ratio",
        direction: "maximize",
        weight: 0.5,
        target: 1.5,
        threshold: 1.0,
        compute: (w) => (w.getEntitiesByType("Portfolio")[0]?.properties.current_sharpe as number) ?? 0,
      },
      {
        id: "drawdown",
        name: "最大回撤",
        direction: "minimize",
        weight: 0.35,
        target: 0.15,
        threshold: 0.20,
        compute: (w) => (w.getEntitiesByType("Portfolio")[0]?.properties.max_drawdown as number) ?? 0,
      },
      {
        id: "cash",
        name: "现金比例",
        direction: "maximize",
        weight: 0.15,
        target: 0.15,
        compute: (w) => (w.getEntitiesByType("Portfolio")[0]?.properties.cash_ratio as number) ?? 0,
      },
    ],
    constraints: [
      {
        id: "max_drawdown",
        description: "最大回撤不超15%",
        severity: "hard",
        check: (w) => ((w.getEntitiesByType("Portfolio")[0]?.properties.max_drawdown as number) ?? 1) <= 0.15,
      },
      {
        id: "sector_concentration",
        description: "单一行业仓位不超35%",
        severity: "soft",
        check: (w) => ((w.getEntitiesByType("Portfolio")[0]?.properties.tech_weight as number) ?? 0) <= 0.35,
      },
    ],
    tradeoffs: [],
  };
}
