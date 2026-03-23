// ============================================================
// DCAS L6: Decision Loop Controller
// ============================================================

import type { WorldGraph } from "../world-model/graph.js";
import type { ObjectiveSpec } from "../objective/types.js";
import { evaluateObjective } from "../objective/objective.js";
import type { PredictionEngine } from "../prediction/engine.js";
import type { Strategy, RankedStrategies } from "../simulation/types.js";
import { compareStrategies } from "../simulation/comparator.js";
import type { DecisionStore } from "../memory/decision-store.js";
import type { DCASConfig } from "../config.js";
import { DEFAULT_CONFIG as DCAS_DEFAULT_CONFIG } from "../config.js";

export type ControllerMode = "reactive" | "monitoring" | "autonomous";

export interface ControllerConfig {
  mode: ControllerMode;
  /** How often to check KPIs (ms) */
  checkIntervalMs: number;
  /** Auto-execute threshold: only auto-act if top strategy confidence > this */
  autoConfidenceThreshold: number;
  /** Auto-execute floor: only auto-act if worst case > this */
  autoWorstCaseFloor: number;
}

export interface Alert {
  kpiId: string;
  kpiName: string;
  currentValue: number;
  threshold: number;
  direction: "maximize" | "minimize";
  severity: "warning" | "critical";
}

export interface ControllerAction {
  type: "recommend" | "auto_execute";
  rankings: RankedStrategies;
  alerts: Alert[];
  reasoning: string;
}

const DEFAULT_CONFIG: ControllerConfig = {
  mode: "monitoring",
  checkIntervalMs: 60000,
  autoConfidenceThreshold: 0.9,
  autoWorstCaseFloor: 0.3,
};

/**
 * Decision Loop Controller.
 *
 * Continuously monitors KPIs and triggers the decision pipeline
 * when thresholds are breached.
 *
 * Modes:
 * - reactive: only acts when explicitly triggered
 * - monitoring: checks KPIs periodically, recommends actions
 * - autonomous: monitoring + auto-executes when confidence is high enough
 */
export class DecisionLoopController {
  private config: ControllerConfig;
  private dcasConfig: DCASConfig;
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private world: WorldGraph,
    private objective: ObjectiveSpec,
    private strategyGenerator: () => Strategy[],
    config?: Partial<ControllerConfig>,
    private predictionEngine?: PredictionEngine,
    private decisionStore?: DecisionStore,
    dcasConfig?: DCASConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.dcasConfig = dcasConfig ?? DCAS_DEFAULT_CONFIG;
  }

  /**
   * Check KPIs and return any alerts.
   */
  checkKPIs(): Alert[] {
    const result = evaluateObjective(this.objective, this.world);
    const alerts: Alert[] = [];

    for (const kpiResult of result.kpiResults) {
      const kpiDef = this.objective.kpis.find((k) => k.id === kpiResult.kpiId);
      if (!kpiDef?.threshold) continue;

      const breached = kpiDef.direction === "maximize"
        ? kpiResult.value < kpiDef.threshold
        : kpiResult.value > kpiDef.threshold;

      if (breached) {
        const severity = kpiResult.normalizedScore < this.dcasConfig.controller.criticalScoreThreshold ? "critical" : "warning";
        alerts.push({
          kpiId: kpiResult.kpiId,
          kpiName: kpiResult.name,
          currentValue: kpiResult.value,
          threshold: kpiDef.threshold,
          direction: kpiDef.direction,
          severity,
        });
      }
    }

    return alerts;
  }

  /**
   * Run one decision cycle: check KPIs → generate strategies → simulate → decide.
   */
  runCycle(): ControllerAction | null {
    const alerts = this.checkKPIs();

    if (alerts.length === 0 && this.config.mode !== "reactive") {
      return null; // No alerts in monitoring/autonomous mode
    }

    // Generate candidate strategies
    const strategies = this.strategyGenerator();
    if (strategies.length === 0) return null;

    // Simulate and rank
    const rankings = compareStrategies(
      this.world,
      strategies,
      this.objective,
      this.predictionEngine,
    );

    const top = rankings.rankings[0];
    if (!top) return null;

    // Decide: auto-execute or recommend?
    const shouldAutoExecute =
      this.config.mode === "autonomous" &&
      top.score >= this.config.autoConfidenceThreshold &&
      top.riskProfile.worstCase >= this.config.autoWorstCaseFloor &&
      !top.objectiveResult.hardViolation;

    const action: ControllerAction = {
      type: shouldAutoExecute ? "auto_execute" : "recommend",
      rankings,
      alerts,
      reasoning: shouldAutoExecute
        ? `自动执行: ${top.strategyName} (得分${top.score.toFixed(3)}, 最差${top.riskProfile.worstCase.toFixed(3)})`
        : `推荐: ${top.strategyName} (得分${top.score.toFixed(3)})${alerts.length > 0 ? `, ${alerts.length}项KPI告警` : ""}`,
    };

    // Record decision if store available
    if (this.decisionStore) {
      this.decisionStore.recordDecision({
        world: this.world,
        rankings,
        chosenStrategyId: top.strategyId,
        chosenBy: shouldAutoExecute ? "auto" : "human",
        reasonForChoice: action.reasoning,
        objectiveResult: top.objectiveResult,
      });
    }

    return action;
  }

  /**
   * Start the monitoring loop.
   */
  start(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.running) return;
    this.running = true;

    if (this.config.mode !== "reactive") {
      this.timer = setInterval(() => {
        this.runCycle();
      }, this.config.checkIntervalMs);
    }
  }

  /**
   * Stop the monitoring loop.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Update the world model reference */
  updateWorld(world: WorldGraph): void {
    this.world = world;
  }

  /** Update controller mode */
  setMode(mode: ControllerMode): void {
    this.config.mode = mode;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get mode(): ControllerMode {
    return this.config.mode;
  }
}
