import type { WorldGraph } from "@dcas/core";
import { ENTITY_TYPES, RELATION_TYPES } from "./ontology.js";

/**
 * Pre-load core legal knowledge into a WorldGraph.
 */
export function seedLegalData(world: WorldGraph) {
  // Key labor law statutes
  const statute82 = world.addEntity(ENTITY_TYPES.Statute, {
    code: "劳动合同法",
    article: "第82条",
    description: "用人单位自用工之日起超过一个月不满一年未与劳动者订立书面劳动合同的，应当向劳动者每月支付二倍的工资",
    compensation_rule: "double_salary",
  });

  const statute87 = world.addEntity(ENTITY_TYPES.Statute, {
    code: "劳动合同法",
    article: "第87条",
    description: "用人单位违反本法规定解除或者终止劳动合同的，应当依照本法第四十七条规定的经济补偿标准的二倍向劳动者支付赔偿金",
    compensation_rule: "double_severance",
  });

  const statute47 = world.addEntity(ENTITY_TYPES.Statute, {
    code: "劳动合同法",
    article: "第47条",
    description: "经济补偿按劳动者在本单位工作的年限，每满一年支付一个月工资的标准向劳动者支付",
    compensation_rule: "monthly_per_year",
  });

  const statute38 = world.addEntity(ENTITY_TYPES.Statute, {
    code: "劳动合同法",
    article: "第38条",
    description: "用人单位未及时足额支付劳动报酬的，劳动者可以解除劳动合同",
    compensation_rule: "worker_termination_right",
  });

  // Sample judges
  const judgeWang = world.addEntity(ENTITY_TYPES.Judge, {
    name: "王法官",
    pro_labor_rate: 0.786,
    avg_cycle_days: 95,
    total_cases: 28,
  });

  const judgeLi = world.addEntity(ENTITY_TYPES.Judge, {
    name: "李仲裁员",
    pro_labor_rate: 0.65,
    avg_cycle_days: 120,
    total_cases: 45,
  });

  const judgeZhao = world.addEntity(ENTITY_TYPES.Judge, {
    name: "赵法官",
    pro_labor_rate: 0.82,
    avg_cycle_days: 80,
    total_cases: 62,
  });

  // Sample precedents
  const prec1 = world.addEntity(ENTITY_TYPES.Precedent, {
    case_type: "labor_dispute",
    outcome: "plaintiff_wins",
    awarded_amount: 85000,
    description: "未签劳动合同双倍工资+违法解除赔偿金",
  });

  const prec2 = world.addEntity(ENTITY_TYPES.Precedent, {
    case_type: "labor_dispute",
    outcome: "settled",
    awarded_amount: 62000,
    description: "和解结案，当事人获赔偿6.2万",
  });

  const prec3 = world.addEntity(ENTITY_TYPES.Precedent, {
    case_type: "labor_dispute",
    outcome: "plaintiff_wins",
    awarded_amount: 110000,
    description: "加班费+未签合同双倍工资+违法解除赔偿金",
  });

  // Link precedents to judges
  world.addRelation(RELATION_TYPES.decided_by, prec1.id, judgeWang.id);
  world.addRelation(RELATION_TYPES.decided_by, prec2.id, judgeLi.id);
  world.addRelation(RELATION_TYPES.decided_by, prec3.id, judgeZhao.id);

  // Link precedents to statutes
  world.addRelation(RELATION_TYPES.interprets, prec1.id, statute82.id);
  world.addRelation(RELATION_TYPES.interprets, prec1.id, statute87.id);
  world.addRelation(RELATION_TYPES.interprets, prec3.id, statute82.id);
  world.addRelation(RELATION_TYPES.interprets, prec3.id, statute38.id);

  return { statutes: { statute82, statute87, statute47, statute38 }, judges: { judgeWang, judgeLi, judgeZhao }, precedents: { prec1, prec2, prec3 } };
}
