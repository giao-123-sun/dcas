import type { WorldGraph } from "@dcas/core";

export function seedContentSelfModel(world: WorldGraph) {
  const team = world.addEntity("Self", {
    name: "TechInsight运营团队",
    type: "content_team",
    specializations: ["AI/tech content", "WeChat operations"],
    total_available_hours: 0,
    workload_state: "optimal",
  });

  const editor = world.addEntity("TeamMember", {
    name: "主编",
    role: "lead_editor",
    current_load: 6,
    max_load: 10,
    available_hours: 30,
    proficiency_deep_content: 0.85,
    proficiency_trending: 0.60,
    proficiency_interactive: 0.70,
    proficiency_data_analysis: 0.75,
    fatigue_level: 0.3,
    performance_factor: 1.0,
  });

  const designer = world.addEntity("TeamMember", {
    name: "设计师",
    role: "designer",
    current_load: 8,
    max_load: 10,
    available_hours: 15,
    proficiency_visual_design: 0.90,
    proficiency_video_editing: 0.65,
    fatigue_level: 0.4,
    performance_factor: 0.95,
  });

  world.addRelation("member_of", editor.id, team.id);
  world.addRelation("member_of", designer.id, team.id);

  const gap = world.addEntity("CapabilityGap", {
    area: "short_video_production",
    severity: "moderate",
    mitigation: "Hire freelance video creator",
  });
  world.addRelation("lacks_capability", team.id, gap.id);

  return { team, editor, designer, gap };
}
