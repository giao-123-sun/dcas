import type { Strategy } from "@dcas/core";
import type { EntityId } from "@dcas/core";

export function generateInvestmentStrategies(portfolioId: EntityId): Strategy[] {
  return [
    {
      id: "defensive_rebalance",
      name: "防御性调仓",
      description: "降低科技仓位，增加防御性配置（公用事业+医疗+黄金）",
      generatedBy: "template" as const,
      actions: [
        { description: "降低科技仓位至30%", entityId: portfolioId, property: "tech_weight", value: 0.30 },
        { description: "增加防御配置至25%", entityId: portfolioId, property: "defensive_weight", value: 0.25 },
        { description: "增加黄金至5%", entityId: portfolioId, property: "gold_weight", value: 0.05 },
        { description: "预期Sharpe 1.25", entityId: portfolioId, property: "current_sharpe", value: 1.25 },
        { description: "预期最大回撤14.1%", entityId: portfolioId, property: "max_drawdown", value: 0.141 },
        { description: "保留现金10%", entityId: portfolioId, property: "cash_ratio", value: 0.10 },
      ],
    },
    {
      id: "aggressive_growth",
      name: "激进增长",
      description: "维持高科技仓位，加仓AI相关标的",
      generatedBy: "template" as const,
      actions: [
        { description: "维持科技仓位45%", entityId: portfolioId, property: "tech_weight", value: 0.45 },
        { description: "防御配置降至10%", entityId: portfolioId, property: "defensive_weight", value: 0.10 },
        { description: "黄金降至2%", entityId: portfolioId, property: "gold_weight", value: 0.02 },
        { description: "预期Sharpe 1.50", entityId: portfolioId, property: "current_sharpe", value: 1.50 },
        { description: "预期最大回撤22%", entityId: portfolioId, property: "max_drawdown", value: 0.22 },
        { description: "现金降至5%", entityId: portfolioId, property: "cash_ratio", value: 0.05 },
      ],
    },
    {
      id: "balanced_hedge",
      name: "平衡对冲",
      description: "均衡配置，增加黄金和债券对冲尾部风险",
      generatedBy: "template" as const,
      actions: [
        { description: "科技仓位35%", entityId: portfolioId, property: "tech_weight", value: 0.35 },
        { description: "防御配置20%", entityId: portfolioId, property: "defensive_weight", value: 0.20 },
        { description: "黄金+债券8%", entityId: portfolioId, property: "gold_weight", value: 0.08 },
        { description: "预期Sharpe 1.30", entityId: portfolioId, property: "current_sharpe", value: 1.30 },
        { description: "预期最大回撤11.3%", entityId: portfolioId, property: "max_drawdown", value: 0.113 },
        { description: "保留现金8%", entityId: portfolioId, property: "cash_ratio", value: 0.08 },
      ],
    },
  ];
}
