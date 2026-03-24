import type { WorldGraph } from "@dcas/core";
import { ENTITY_TYPES, RELATION_TYPES } from "./ontology.js";

export function seedInvestmentData(world: WorldGraph) {
  // Portfolio
  const portfolio = world.addEntity(ENTITY_TYPES.Portfolio, {
    name: "Growth Portfolio",
    total_value: 1000000,
    cash_ratio: 0.1,
    current_sharpe: 1.35,
    max_drawdown: 0.082,
  });

  // Sectors
  const tech = world.addEntity(ENTITY_TYPES.Sector, { name: "Technology", total_weight: 0.42, outlook: "bullish" });
  const healthcare = world.addEntity(ENTITY_TYPES.Sector, { name: "Healthcare", total_weight: 0.15, outlook: "neutral" });
  const utilities = world.addEntity(ENTITY_TYPES.Sector, { name: "Utilities", total_weight: 0.08, outlook: "neutral" });
  const finance = world.addEntity(ENTITY_TYPES.Sector, { name: "Finance", total_weight: 0.15, outlook: "bullish" });

  // Assets
  const techETF = world.addEntity(ENTITY_TYPES.Asset, { name: "Tech ETF", ticker: "QQQ", sector: "Technology", weight: 0.30, expected_return: 0.18, volatility: 0.22, beta: 1.3 });
  const aiStock = world.addEntity(ENTITY_TYPES.Asset, { name: "AI Leader", ticker: "NVDA", sector: "Technology", weight: 0.12, expected_return: 0.25, volatility: 0.35, beta: 1.8 });
  const healthETF = world.addEntity(ENTITY_TYPES.Asset, { name: "Health ETF", ticker: "XLV", sector: "Healthcare", weight: 0.15, expected_return: 0.10, volatility: 0.14, beta: 0.7 });
  const utilETF = world.addEntity(ENTITY_TYPES.Asset, { name: "Utilities ETF", ticker: "XLU", sector: "Utilities", weight: 0.08, expected_return: 0.06, volatility: 0.12, beta: 0.4 });
  const bankETF = world.addEntity(ENTITY_TYPES.Asset, { name: "Bank ETF", ticker: "XLF", sector: "Finance", weight: 0.15, expected_return: 0.12, volatility: 0.18, beta: 1.1 });
  const goldETF = world.addEntity(ENTITY_TYPES.Asset, { name: "Gold ETF", ticker: "GLD", sector: "Commodities", weight: 0.05, expected_return: 0.04, volatility: 0.15, beta: -0.1 });
  const bonds = world.addEntity(ENTITY_TYPES.Asset, { name: "Bond Fund", ticker: "AGG", sector: "Fixed Income", weight: 0.05, expected_return: 0.03, volatility: 0.05, beta: -0.2 });

  // Macro factors
  const rateHike = world.addEntity(ENTITY_TYPES.MacroFactor, { name: "Interest Rate", current_value: 4.5, scenario: "rate_hike", probability: 0.38 });
  const recession = world.addEntity(ENTITY_TYPES.MacroFactor, { name: "Recession Risk", current_value: 0.22, scenario: "recession", probability: 0.22 });
  const growth = world.addEntity(ENTITY_TYPES.MacroFactor, { name: "GDP Growth", current_value: 2.1, scenario: "mild_growth", probability: 0.40 });

  // Relations
  world.addRelation(RELATION_TYPES.holds, portfolio.id, techETF.id, { weight: 0.30 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, aiStock.id, { weight: 0.12 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, healthETF.id, { weight: 0.15 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, utilETF.id, { weight: 0.08 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, bankETF.id, { weight: 0.15 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, goldETF.id, { weight: 0.05 });
  world.addRelation(RELATION_TYPES.holds, portfolio.id, bonds.id, { weight: 0.05 });

  world.addRelation(RELATION_TYPES.belongs_to_sector, techETF.id, tech.id);
  world.addRelation(RELATION_TYPES.belongs_to_sector, aiStock.id, tech.id);
  world.addRelation(RELATION_TYPES.belongs_to_sector, healthETF.id, healthcare.id);
  world.addRelation(RELATION_TYPES.belongs_to_sector, utilETF.id, utilities.id);
  world.addRelation(RELATION_TYPES.belongs_to_sector, bankETF.id, finance.id);

  world.addRelation(RELATION_TYPES.sensitive_to, techETF.id, rateHike.id, { sensitivity: -0.15 });
  world.addRelation(RELATION_TYPES.sensitive_to, aiStock.id, rateHike.id, { sensitivity: -0.20 });
  world.addRelation(RELATION_TYPES.sensitive_to, bankETF.id, rateHike.id, { sensitivity: 0.10 });
  world.addRelation(RELATION_TYPES.sensitive_to, goldETF.id, recession.id, { sensitivity: 0.15 });
  world.addRelation(RELATION_TYPES.sensitive_to, bonds.id, rateHike.id, { sensitivity: -0.08 });

  return {
    portfolio,
    sectors: { tech, healthcare, utilities, finance },
    assets: { techETF, aiStock, healthETF, utilETF, bankETF, goldETF, bonds },
    macroFactors: { rateHike, recession, growth },
  };
}
