import { describe, it, expect } from "vitest";
import { WorldGraph } from "../../src/world-model/graph.js";
import { AdversaryModel } from "../../src/prediction/models/adversary.js";
import type { AdversaryProfile } from "../../src/prediction/models/adversary.js";
import type { EntityId } from "../../src/world-model/types.js";

describe("AdversaryModel", () => {
  const profile: AdversaryProfile = {
    entityId: "opp_001" as EntityId,
    entityType: "corporation",
    behaviors: [
      { situation: "settlement_offer", response: "counter_offer", probability: 0.45 },
      { situation: "litigation_threat", response: "willing_to_negotiate", probability: 0.6 },
      { situation: "evidence_presentation", response: "challenge_evidence", probability: 0.35 },
    ],
    defaultTendency: { mean: 0.5, std: 0.2 },
  };

  it("should predict using default tendency without action", async () => {
    const model = new AdversaryModel("adv_1", "opponent_response", profile);
    const g = new WorldGraph();

    const pred = await model.predict({ world: g, targetProperty: "opponent_response" });
    expect(pred.mean).toBe(0.5);
    expect(pred.std).toBe(0.2);
    expect(pred.modelId).toBe("adv_1");
  });

  it("should predict using matching behavior when action provided", async () => {
    const model = new AdversaryModel("adv_1", "opponent_response", profile);
    const g = new WorldGraph();

    const pred = await model.predict({
      world: g,
      targetProperty: "opponent_response",
      action: { type: "settlement_offer", description: "settlement_offer at 80000", parameters: {} },
    });

    // Should use the matched behavior, not default
    expect(pred.confidence).toBeGreaterThan(model.accuracy);
  });

  it("should predict possible actions", async () => {
    const model = new AdversaryModel("adv_1", "opponent_response", profile);
    const g = new WorldGraph();

    const actions = await model.predictActions(g, {
      description: "propose settlement",
      entityId: "case_001" as EntityId,
      property: "strategy",
      value: "settlement",
    });

    expect(actions.length).toBe(3);
    const totalProb = actions.reduce((s, a) => s + a.probability, 0);
    expect(totalProb).toBeCloseTo(1, 1);
  });

  it("should fall back gracefully without LLM client", async () => {
    const model = new AdversaryModel("adv_1", "opponent_response", profile);
    const g = new WorldGraph();

    // No LLM client, should use default tendency
    const pred = await model.predict({ world: g, targetProperty: "opponent_response" });
    expect(pred.mean).toBeDefined();
    expect(pred.std).toBeGreaterThan(0);
  });
});
