// ============================================================
// MetaClaw Skill Manager — file system CRUD + versioning
// ============================================================

import type { MetaClawSkill, SkillIndex, SkillIndexEntry } from "./types.js";

/**
 * Abstract file system interface.
 * Allows testing without real FS and swapping to other storage backends.
 */
export interface SkillFileSystem {
  readJSON<T>(path: string): Promise<T | null>;
  writeJSON(path: string, data: unknown): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  list(dir: string): Promise<string[]>;
  remove(path: string): Promise<void>;
}

/**
 * Manages DCAS skills in the MetaClaw skill directory.
 *
 * Directory layout:
 *   {basePath}/
 *   ├── active/        — currently active skills
 *   ├── archived/      — superseded/expired skills
 *   └── index.json     — skill index
 */
export class SkillManager {
  constructor(
    private fs: SkillFileSystem,
    private basePath: string,
  ) {}

  async initialize(): Promise<void> {
    await this.fs.mkdir(`${this.basePath}/active`);
    await this.fs.mkdir(`${this.basePath}/archived`);

    const indexExists = await this.fs.exists(`${this.basePath}/index.json`);
    if (!indexExists) {
      await this.fs.writeJSON(`${this.basePath}/index.json`, {
        skills: [],
        last_sync: new Date().toISOString(),
      });
    }
  }

  /**
   * Deploy a new skill (write to active directory + update index).
   * If superseding an old version, archives the old one.
   */
  async deploySkill(skill: MetaClawSkill): Promise<void> {
    // Archive superseded skill
    if (skill.dcas_metadata?.supersedes) {
      await this.archiveSkill(skill.dcas_metadata.supersedes);
    }

    // Write skill file
    const filePath = `active/${skill.name}.json`;
    await this.fs.writeJSON(`${this.basePath}/${filePath}`, skill);

    // Update index
    const index = await this.getIndex();
    const baseName = this.getBaseName(skill.name);
    const existingIdx = index.skills.findIndex((s) => s.name === baseName);

    const entry: SkillIndexEntry = {
      name: baseName,
      current_version: skill.dcas_metadata?.version ?? 1,
      status: "active",
      file: filePath,
      created_at: skill.created_at,
      feedback_count: 0,
      avg_execution_reward: 0,
      total_uses: 0,
    };

    if (existingIdx >= 0) {
      // Preserve feedback stats from previous version
      entry.feedback_count = index.skills[existingIdx].feedback_count;
      entry.avg_execution_reward = index.skills[existingIdx].avg_execution_reward;
      entry.total_uses = index.skills[existingIdx].total_uses;
      index.skills[existingIdx] = entry;
    } else {
      index.skills.push(entry);
    }

    index.last_sync = new Date().toISOString();
    await this.fs.writeJSON(`${this.basePath}/index.json`, index);
  }

  /**
   * Move a skill from active to archived.
   */
  async archiveSkill(skillName: string): Promise<boolean> {
    const activePath = `${this.basePath}/active/${skillName}.json`;
    const exists = await this.fs.exists(activePath);
    if (!exists) return false;

    const skill = await this.fs.readJSON<MetaClawSkill>(activePath);
    if (skill) {
      await this.fs.writeJSON(`${this.basePath}/archived/${skillName}.json`, skill);
    }
    await this.fs.remove(activePath);

    // Update index
    const index = await this.getIndex();
    const baseName = this.getBaseName(skillName);
    const entry = index.skills.find((s) => s.name === baseName);
    if (entry) {
      entry.status = "archived";
    }
    await this.fs.writeJSON(`${this.basePath}/index.json`, index);

    return true;
  }

  /**
   * Get a skill by name from active directory.
   */
  async getActiveSkill(skillName: string): Promise<MetaClawSkill | null> {
    return this.fs.readJSON<MetaClawSkill>(`${this.basePath}/active/${skillName}.json`);
  }

  /**
   * List all active skills.
   */
  async listActiveSkills(): Promise<string[]> {
    const files = await this.fs.list(`${this.basePath}/active`);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));
  }

  /**
   * Get the skill index.
   */
  async getIndex(): Promise<SkillIndex> {
    const index = await this.fs.readJSON<SkillIndex>(`${this.basePath}/index.json`);
    return index ?? { skills: [], last_sync: new Date().toISOString() };
  }

  /**
   * Record feedback for a skill (updates index stats).
   */
  async recordFeedback(baseName: string, reward: number): Promise<void> {
    const index = await this.getIndex();
    const entry = index.skills.find((s) => s.name === baseName);
    if (!entry) return;

    // Exponential moving average for reward
    entry.total_uses += 1;
    entry.feedback_count += 1;
    entry.avg_execution_reward =
      entry.avg_execution_reward * 0.9 + reward * 0.1;
    entry.last_feedback = new Date().toISOString();

    await this.fs.writeJSON(`${this.basePath}/index.json`, index);
  }

  /**
   * Extract base name from versioned skill name.
   * "dcas_settlement_v3" → "dcas_settlement"
   */
  private getBaseName(name: string): string {
    return name.replace(/_v\d+$/, "");
  }
}
