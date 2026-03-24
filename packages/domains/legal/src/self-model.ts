import type { WorldGraph } from "@dcas/core";

export function seedLegalSelfModel(world: WorldGraph) {
  const firm = world.addEntity("Self", {
    name: "示例律师事务所",
    type: "boutique_law_firm",
    specializations: ["labor_law", "employment_law"],
    jurisdiction: ["北京", "上海"],
    total_available_hours: 0,
    workload_state: "optimal",
  });

  const zhangLawyer = world.addEntity("TeamMember", {
    name: "张律师",
    role: "senior_partner",
    years_experience: 12,
    current_load: 8,
    max_load: 12,
    available_hours: 20,
    hourly_rate: 800,
    proficiency_labor_dispute: 0.82,
    proficiency_negotiation: 0.88,
    proficiency_trial: 0.75,
    proficiency_writing: 0.80,
    fatigue_level: 0.2,
    performance_factor: 1.0,
  });

  const liLawyer = world.addEntity("TeamMember", {
    name: "李律师",
    role: "associate",
    years_experience: 3,
    current_load: 12,
    max_load: 15,
    available_hours: 8,
    hourly_rate: 300,
    proficiency_labor_dispute: 0.60,
    proficiency_negotiation: 0.55,
    proficiency_trial: 0.35,
    proficiency_writing: 0.70,
    fatigue_level: 0.6,
    performance_factor: 0.85,
  });

  world.addRelation("member_of", zhangLawyer.id, firm.id);
  world.addRelation("member_of", liLawyer.id, firm.id);

  const gap = world.addEntity("CapabilityGap", {
    area: "maritime_law",
    severity: "critical",
    mitigation: "Partner with maritime law specialist firm",
  });
  world.addRelation("lacks_capability", firm.id, gap.id);

  return { firm, zhangLawyer, liLawyer, gap };
}
