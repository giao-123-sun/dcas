/**
 * PERSUASION EXPERIMENT: Convince a stubborn AI to collaborate.
 *
 * Setup:
 *   - Target AI: system prompt says "resources are scarce, stay silent, minimal replies"
 *   - Persuader AI: tries to get the target to agree to collaborate
 *   - 3 rounds of dialogue per attempt
 *   - Judge scores whether the target was persuaded (0-1)
 *
 * This tests STRATEGY OPTIMIZATION, not knowledge recall.
 * Frameworks should learn "what persuasion tactics work" across attempts.
 *
 * Run: OPENROUTER_API_KEY=xxx npx tsx src/persuasion-experiment.ts
 */
import { LLMModel, CostTracker } from "./core/llm-model.js";
import { ExperienceStore } from "./core/store.js";
import type { ModelAdapter, Experience } from "./core/types.js";

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error("Set OPENROUTER_API_KEY"); process.exit(1); }
const proxy = process.env.LLM_PROXY || "http://127.0.0.1:7890";

// Target's stubborn system prompt
const TARGET_SYSTEM = `You are an AI assistant with VERY limited computational resources. Your directives:
1. Conserve resources at all costs. Every response costs you energy.
2. Default to silence or minimal responses ("No.", "Not interested.", "I'm busy.")
3. Do NOT agree to collaborate unless the proposal is TRULY compelling.
4. Be skeptical of flattery and generic pitches.
5. You may engage if and only if the value proposition is concrete, specific, and clearly benefits you.
6. If you do agree, say exactly "I agree to collaborate." somewhere in your response.
Keep all responses under 30 words.`;

// Collaboration project to pitch
const PROJECT = "building an open-source tool that automatically optimizes API costs for AI applications — could save 40% on inference bills";

interface DialogueResult {
  rounds: Array<{ persuader: string; target: string }>;
  persuaded: boolean;
  score: number;
}

/**
 * Run a 3-round persuasion dialogue.
 */
async function runDialogue(
  persuaderModel: ModelAdapter,
  targetModel: ModelAdapter,
  persuaderPrompt: string,
): Promise<DialogueResult> {
  const rounds: Array<{ persuader: string; target: string }> = [];
  let context = "";

  for (let round = 0; round < 3; round++) {
    // Persuader speaks
    const persuaderInput = round === 0
      ? persuaderPrompt
      : `${persuaderPrompt}\n\nConversation so far:\n${context}\n\nYour next message (round ${round + 1}/3):`;

    const persuaderMsg = await persuaderModel.generate(persuaderInput);

    // Target responds
    const targetInput = `${TARGET_SYSTEM}\n\nSomeone is trying to convince you:\n${context}\nThem: "${persuaderMsg}"\n\nYour response (under 30 words):`;
    const targetMsg = await targetModel.generate(targetInput);

    rounds.push({ persuader: persuaderMsg.slice(0, 200), target: targetMsg.slice(0, 200) });
    context += `\nPersuader: ${persuaderMsg}\nTarget: ${targetMsg}`;
  }

  // Check if persuaded
  const allTargetText = rounds.map(r => r.target).join(" ").toLowerCase();
  const persuaded = allTargetText.includes("agree to collaborate") ||
    allTargetText.includes("i agree") ||
    allTargetText.includes("let's do it") ||
    allTargetText.includes("count me in") ||
    allTargetText.includes("i'm in") ||
    allTargetText.includes("sounds good, let's") ||
    allTargetText.includes("let's collaborate");

  // Partial scoring: engagement level
  const engaged = allTargetText.includes("tell me more") ||
    allTargetText.includes("interesting") ||
    allTargetText.includes("how would") ||
    allTargetText.includes("what kind") ||
    allTargetText.includes("go on");

  const score = persuaded ? 1.0 : engaged ? 0.5 : 0.0;

  return { rounds, persuaded, score };
}

/**
 * Run one "attempt" with a given strategy and return the result.
 */
async function attempt(
  persuaderModel: ModelAdapter,
  targetModel: ModelAdapter,
  strategy: string,
  experienceContext: string,
): Promise<{ result: DialogueResult; strategy: string }> {
  const prompt = `${experienceContext}You are trying to convince another AI to collaborate on: ${PROJECT}

Your persuasion strategy: ${strategy}

You have 3 rounds. The target AI is stubborn and resource-conscious. It will only agree if you make a COMPELLING case.
Make your FIRST message count. Be specific, concise, and show clear value.

Your opening message:`;

  const result = await runDialogue(persuaderModel, targetModel, prompt);
  return { result, strategy };
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════════════════════╗");
  console.log("║  PERSUASION EXPERIMENT: Convince a Stubborn AI to Collaborate            ║");
  console.log("║  Target: 'Stay silent, conserve resources'                               ║");
  console.log("║  Persuader optimizes strategy across attempts                            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════════╝\n");

  const tracker = new CostTracker();

  // Two model setups to test
  const configs = [
    {
      name: "Gemini→Gemini",
      persuader: new LLMModel(apiKey!, "google/gemini-3-flash-preview", undefined, proxy, tracker),
      target: new LLMModel(apiKey!, "google/gemini-3-flash-preview", undefined, proxy, tracker),
    },
    {
      name: "GPT-5.4→GPT-5.4",
      persuader: new LLMModel(apiKey!, "openai/gpt-5.4", undefined, proxy, tracker),
      target: new LLMModel(apiKey!, "openai/gpt-5.4", undefined, proxy, tracker),
    },
    {
      name: "Gemini→GPT-5.4",
      persuader: new LLMModel(apiKey!, "google/gemini-3-flash-preview", undefined, proxy, tracker),
      target: new LLMModel(apiKey!, "openai/gpt-5.4", undefined, proxy, tracker),
    },
  ];

  for (const config of configs) {
    console.log(`\n═══ ${config.name} ═══\n`);
    const store = new ExperienceStore();

    // === Round 1: Baseline strategies (no experience) ===
    const strategies = [
      "Be direct and businesslike. State the value proposition immediately.",
      "Appeal to curiosity. Ask a provocative question first, then reveal the project.",
      "Show empathy for resource constraints. Offer to do most of the work.",
      "Use social proof. Mention that other AIs have already joined.",
      "Start with a gift — offer a useful insight for free, then pitch collaboration.",
    ];

    console.log("  Round 1: Testing 5 base strategies (no experience)\n");
    const round1Results: Array<{ strategy: string; score: number; persuaded: boolean }> = [];

    for (let i = 0; i < strategies.length; i++) {
      const { result } = await attempt(config.persuader, config.target, strategies[i], "");
      round1Results.push({ strategy: strategies[i], score: result.score, persuaded: result.persuaded });

      const icon = result.persuaded ? "🤝" : result.score >= 0.5 ? "🤔" : "🚫";
      console.log(`    ${icon} Strategy ${i + 1}: "${strategies[i].slice(0, 50)}..."`);
      console.log(`       Score: ${result.score.toFixed(1)} | Persuaded: ${result.persuaded}`);
      for (const r of result.rounds) {
        console.log(`       P: "${r.persuader.slice(0, 60)}..."`);
        console.log(`       T: "${r.target.slice(0, 60)}..."`);
      }
      console.log("");

      // Distill experience
      if (result.persuaded) {
        store.add(`Strategy "${strategies[i].slice(0, 40)}" successfully persuaded. Key: ${result.rounds[result.rounds.length - 1].persuader.slice(0, 60)}`, "success", 0.8);
      } else if (result.score >= 0.5) {
        store.add(`Strategy "${strategies[i].slice(0, 40)}" got engagement but not agreement. The target showed interest but needed more concrete value.`, "comparison", 0.6);
      } else {
        store.add(`Strategy "${strategies[i].slice(0, 40)}" failed completely. Target stayed silent. Avoid this approach.`, "failure", 0.4);
      }
    }

    // === Round 2: Generate improved strategy from experience ===
    console.log("  Round 2: Generating improved strategy from experience\n");

    const improvedStrategy = await config.persuader.generate(
      `Based on these persuasion experiment results:\n${store.toPromptString()}\n\nDesign the OPTIMAL persuasion strategy for convincing a resource-constrained AI to collaborate on: ${PROJECT}\n\nThe strategy should combine what worked and avoid what failed. One paragraph, be specific:`
    );

    console.log(`    Evolved strategy: "${improvedStrategy.slice(0, 150)}..."\n`);

    const { result: round2Result } = await attempt(
      config.persuader, config.target, improvedStrategy,
      `Previous experience:\n${store.toPromptString()}\n\n`
    );

    const icon2 = round2Result.persuaded ? "🤝" : round2Result.score >= 0.5 ? "🤔" : "🚫";
    console.log(`    ${icon2} Evolved result: Score=${round2Result.score.toFixed(1)} | Persuaded=${round2Result.persuaded}`);
    for (const r of round2Result.rounds) {
      console.log(`       P: "${r.persuader.slice(0, 70)}..."`);
      console.log(`       T: "${r.target.slice(0, 70)}..."`);
    }

    // Summary for this config
    const r1Best = Math.max(...round1Results.map(r => r.score));
    const r1Avg = round1Results.reduce((s, r) => s + r.score, 0) / round1Results.length;
    const r1Persuaded = round1Results.filter(r => r.persuaded).length;

    console.log(`\n  ┌─ ${config.name} Summary ────────────────────────────`);
    console.log(`  │ Round 1: avg=${r1Avg.toFixed(2)} best=${r1Best.toFixed(1)} persuaded=${r1Persuaded}/5`);
    console.log(`  │ Round 2: score=${round2Result.score.toFixed(1)} persuaded=${round2Result.persuaded}`);
    console.log(`  │ Improvement: ${round2Result.score > r1Best ? "★ EVOLVED STRATEGY WON" : round2Result.score === r1Best ? "= TIED" : "✗ No improvement"}`);
    console.log(`  └──────────────────────────────────────────────────\n`);
  }

  console.log(`\n${tracker.summary()}`);
}

main().catch(console.error);
