import type { WorldGraph } from "@dcas/core";

export function seedInvestmentSelfModel(world: WorldGraph) {
  const fund = world.addEntity("Self", {
    name: "Growth Fund Alpha",
    type: "hedge_fund",
    specializations: ["quantitative", "tech_sector", "macro"],
    aum: 50000000, // $50M AUM
    total_available_hours: 0,
    workload_state: "optimal",
  });

  const pm = world.addEntity("TeamMember", {
    name: "基金经理",
    role: "portfolio_manager",
    current_load: 5,
    max_load: 8,
    available_hours: 40,
    proficiency_macro_analysis: 0.85,
    proficiency_quant_modeling: 0.70,
    proficiency_stock_picking: 0.80,
    proficiency_risk_management: 0.90,
    fatigue_level: 0.2,
    performance_factor: 1.0,
  });

  const analyst = world.addEntity("TeamMember", {
    name: "分析师",
    role: "research_analyst",
    current_load: 7,
    max_load: 10,
    available_hours: 25,
    proficiency_macro_analysis: 0.60,
    proficiency_quant_modeling: 0.85,
    proficiency_stock_picking: 0.55,
    proficiency_derivatives: 0.40,
    fatigue_level: 0.5,
    performance_factor: 0.9,
  });

  world.addRelation("member_of", pm.id, fund.id);
  world.addRelation("member_of", analyst.id, fund.id);

  const gap = world.addEntity("CapabilityGap", {
    area: "derivatives_trading",
    severity: "moderate",
    mitigation: "Partner with derivatives specialist or hire",
  });
  world.addRelation("lacks_capability", fund.id, gap.id);

  return { fund, pm, analyst, gap };
}
