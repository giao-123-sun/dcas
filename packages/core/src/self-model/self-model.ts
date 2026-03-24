import type { WorldGraph } from "../world-model/graph.js";
import type { Entity, EntityId } from "../world-model/types.js";
import type { SelfCapability, SelfResource } from "./types.js";

/**
 * SelfModel reads/writes Self-related entities from a WorldGraph.
 * "Self" entities represent the decision-maker (team, firm, individual).
 */
export class SelfModel {
  constructor(private world: WorldGraph) {}

  /** Get the main Self entity */
  getSelfEntity(): Entity | undefined {
    const selves = this.world.getEntitiesByType("Self");
    return selves.length > 0 ? selves[0] : undefined;
  }

  /** Get all team members */
  getTeamMembers(): Entity[] {
    return this.world.getEntitiesByType("TeamMember");
  }

  /** Get a specific team member by their entity ID */
  getMember(memberId: EntityId): Entity | undefined {
    return this.world.getEntity(memberId);
  }

  /** Check if anyone on the team has a specific capability */
  hasCapability(domain: string, taskType: string, minProficiency = 0.5): boolean {
    return this.getBestMemberForTask(domain, taskType, minProficiency) !== undefined;
  }

  /** Find the best team member for a specific task */
  getBestMemberForTask(domain: string, taskType: string, minProficiency = 0): Entity | undefined {
    const members = this.getTeamMembers();
    let best: Entity | undefined;
    let bestScore = minProficiency;

    for (const member of members) {
      const profKey = `proficiency_${taskType}`;
      const domainKey = `proficiency_${domain}`;
      // Check both specific and domain-level proficiency
      const proficiency = Math.max(
        typeof member.properties[profKey] === "number" ? member.properties[profKey] as number : 0,
        typeof member.properties[domainKey] === "number" ? member.properties[domainKey] as number : 0,
      );
      if (proficiency > bestScore) {
        bestScore = proficiency;
        best = member;
      }
    }
    return best;
  }

  /** Get skills that the team lacks */
  getCapabilityGaps(requiredSkills: Array<{ domain: string; taskType: string; minProficiency: number }>): string[] {
    const gaps: string[] = [];
    for (const skill of requiredSkills) {
      if (!this.hasCapability(skill.domain, skill.taskType, skill.minProficiency)) {
        gaps.push(`${skill.domain}/${skill.taskType} (need >= ${skill.minProficiency})`);
      }
    }
    return gaps;
  }

  /** Get total available hours across all team members */
  getAvailableHours(): number {
    return this.getTeamMembers().reduce(
      (sum, m) => sum + (typeof m.properties.available_hours === "number" ? m.properties.available_hours as number : 0),
      0,
    );
  }

  /** Calculate team utilization rate (0-1) */
  getUtilizationRate(): number {
    const members = this.getTeamMembers();
    if (members.length === 0) return 0;
    const totalLoad = members.reduce(
      (s, m) => s + (typeof m.properties.current_load === "number" ? m.properties.current_load as number : 0), 0);
    const totalCapacity = members.reduce(
      (s, m) => s + (typeof m.properties.max_load === "number" ? m.properties.max_load as number : 10), 0);
    return totalCapacity > 0 ? totalLoad / totalCapacity : 0;
  }

  /** Check if team is overloaded (any member > 90% capacity) */
  isOverloaded(): boolean {
    return this.getTeamMembers().some(m => {
      const load = typeof m.properties.current_load === "number" ? m.properties.current_load as number : 0;
      const max = typeof m.properties.max_load === "number" ? m.properties.max_load as number : 10;
      return max > 0 && load / max > 0.9;
    });
  }

  /** Get the execution quality factor for a member on a task */
  getQualityFactor(memberId: EntityId, taskType: string): number {
    const member = this.getMember(memberId);
    if (!member) return 0.5;

    const profKey = `proficiency_${taskType}`;
    const proficiency = typeof member.properties[profKey] === "number" ? member.properties[profKey] as number : 0.5;
    const fatigue = typeof member.properties.fatigue_level === "number" ? member.properties.fatigue_level as number : 0;
    const performance = typeof member.properties.performance_factor === "number" ? member.properties.performance_factor as number : 1.0;

    // quality = proficiency × (1 - fatigue_penalty) × performance_factor
    const fatiguePenalty = fatigue * 0.2; // max 20% penalty at full fatigue
    return proficiency * (1 - fatiguePenalty) * performance;
  }
}
