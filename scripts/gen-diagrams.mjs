#!/usr/bin/env node
/**
 * Generate DCAS architecture diagrams using Gemini Image Generation via OpenRouter
 * Uses curl with proxy to bypass region restrictions
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const API_KEY = process.env.OPENROUTER_API_KEY;
if (!API_KEY) {
  console.error("Set OPENROUTER_API_KEY env var");
  process.exit(1);
}

const MODEL = process.env.MODEL || "google/gemini-3-pro-image-preview";
const PROXY = process.env.PROXY || "http://127.0.0.1:7890";
const OUT_DIR = join(import.meta.dirname, "..", "docs", "diagrams");
mkdirSync(OUT_DIR, { recursive: true });

function callAPI(prompt) {
  const body = JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  // Write body to temp file to avoid shell escaping issues
  const tmpFile = join(OUT_DIR, "_req.json");
  writeFileSync(tmpFile, body);

  const result = execSync(
    `curl -s -x ${PROXY} "https://openrouter.ai/api/v1/chat/completions" ` +
    `-H "Authorization: Bearer ${API_KEY}" ` +
    `-H "Content-Type: application/json" ` +
    `-d @${tmpFile.replace(/\\/g, "/")}`,
    { maxBuffer: 50 * 1024 * 1024, timeout: 180000 }
  );

  return JSON.parse(result.toString());
}

function extractAndSaveImage(data, filename) {
  const msg = data.choices?.[0]?.message;
  if (!msg) {
    console.error("  No message in response");
    return null;
  }

  // Gemini returns images in message.images[] (not content)
  const sources = [
    ...(Array.isArray(msg.images) ? msg.images : []),
    ...(Array.isArray(msg.content) ? msg.content : []),
  ];

  const saved = [];
  for (const part of sources) {
    const url = part.image_url?.url ?? part.image_url;
    if (typeof url !== "string") continue;

    const match = url.match(/^data:image\/(\w+);base64,(.+)$/s);
    if (!match) continue;

    const ext = match[1] === "jpeg" ? "jpg" : match[1];
    const buf = Buffer.from(match[2], "base64");
    const suffix = saved.length === 0 ? "" : `_${saved.length}`;
    const fp = join(OUT_DIR, `${filename}${suffix}.${ext}`);
    writeFileSync(fp, buf);
    saved.push(fp);
    console.log(`  Saved: ${fp} (${(buf.length / 1024).toFixed(1)} KB)`);
  }

  if (saved.length > 0) return saved[0];

  // Save raw for debug
  writeFileSync(join(OUT_DIR, `${filename}_raw.json`), JSON.stringify(data, null, 2));
  return null;
}

// ============================================================
// Diagrams
// ============================================================

const diagrams = [
  {
    filename: "01_dcas_overview",
    prompt: `Generate a clean, professional technical architecture diagram image.

Title at top: "DCAS 六层决策架构" (Decision-Centric Agent System)

Show 6 horizontal layers stacked vertically, each a wide rounded rectangle with an icon and description:

Bottom layer (blue #2563eb): "L1: World Model — 世界是什么样的"
  Subtitle: Typed Property Graph / Fork / Cascade

Layer 2 (green #16a34a): "L2: Objective Function — 我们要什么"
  Subtitle: Multi-KPI / Constraints / Tradeoffs

Layer 3 (amber #d97706): "L3: Prediction Engine — 会发生什么"
  Subtitle: Probability Distributions / Ensemble

Layer 4 (red #dc2626): "L4: Simulation & Strategy — 应该怎么做"
  Subtitle: World Fork × Strategies / Monte Carlo

Layer 5 (purple #7c3aed): "L5: Memory & Learning — 学到了什么"
  Subtitle: Decision Records / Pattern Extraction

Top layer (slate #334155): "L6: Decision Loop — 何时行动"
  Subtitle: KPI Monitoring / Auto Execute

On the right side, a separate box labeled "MetaClaw" (execution layer) connected to L4-L6 with arrows.

A large circular arrow on the left showing the feedback loop from L5 back to L1.

Style: dark background (#0f172a), modern tech diagram, clean sans-serif typography, subtle glow effects. Wide format 1600x900.`,
  },
  {
    filename: "02_world_model_detail",
    prompt: `Generate a technical diagram image showing a "World Model" graph database with fork capability.

Title: "L1: World Model — 实体关系图 + Fork + Cascade"

CENTER: A property graph with 4 nodes connected by labeled edges:
- Blue node "Case 劳动仲裁案" (properties: amount=¥80,000, strategy=?)
- Green node "Judge 王法官" (tendency: 偏向劳动者)
- Yellow node "Statute 劳动法§47"
- Orange node "Budget" (allocated: ¥50,000)
- Edge: Case →decided_by→ Judge
- Edge: Case →applies→ Statute
- Edge: Case →has_budget→ Budget

RIGHT SIDE: Three branches forking from the center graph like a tree:
- Branch A (green glow): "Fork A: 和解" strategy=settlement, Budget→¥30K
- Branch B (red glow): "Fork B: 抗辩" strategy=defense, Budget→¥80K
- Branch C (yellow glow): "Fork C: 异议" strategy=jurisdiction, Budget→¥45K

Show a lightning bolt arrow from Case.strategy change cascading to Budget.allocated.

Style: dark background (#0d1117), neon-colored nodes, glowing edges for cascade. 1600x900.`,
  },
  {
    filename: "03_decision_flow",
    prompt: `Generate a horizontal flowchart image showing a decision-making pipeline.

Title: "DCAS 决策闭环流程"

Left to right flow:

1. "外部数据" (database icon) →
2. "World Model" (graph icon, blue) →
3. "目标评估" (gauge icon, green) — shows KPI check →
4. "预测引擎" (crystal ball, orange) — shows probability curves →
5. "策略模拟" (3 parallel world boxes branching: ✅好 / ⚠️中 / ❌差) →
6. Diamond "置信度>90%?"
   - Yes arrow → "MetaClaw 自动执行" (robot icon)
   - No arrow → "人工审核" (human icon)
7. Both paths merge → "执行结果" →
8. Big feedback arrow curving back to top → "Memory & Learning" → back to World Model

The feedback loop arrow should be prominent and thick.

Style: dark background, gradient arrows (blue→green→orange→red flow), modern infographic. Wide panoramic 1800x700.`,
  },
  {
    filename: "04_day1_summary",
    prompt: `Generate an infographic image summarizing "Day 1" development progress.

Title: "DCAS Day 1: World Model 核心引擎"

LEFT panel "代码结构":
File tree visualization:
  packages/core/src/
  ├── world-model/
  │   ├── types.ts — 核心类型
  │   ├── entity.ts — 实体工厂
  │   ├── relation.ts — 关系工厂
  │   ├── graph.ts ★ — WorldGraph
  │   ├── cascade.ts — 级联引擎
  │   └── fork.ts — 世界分叉
  └── index.ts

CENTER panel "4大核心能力" (4 cards with icons):
  1. 🔷 Typed Property Graph — entities + relations + properties
  2. ⚡ Cascade Propagation — auto-propagate along edges
  3. 🌿 World Fork — create parallel world branches
  4. 🔒 Branded Types — compile-time type safety

RIGHT panel "测试":
  Large green checkmark
  27 tests ✅
  3 test suites ✅
  Build: ESM + CJS + d.ts ✅

Bottom bar: "Day 1 Complete → Next: L2 Objective + L3 Prediction"

Style: dark background (#0f0f1a), card-based layout, green accents for success, star highlight on graph.ts. Developer dashboard aesthetic. 1600x1000.`,
  },
];

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`Generating ${diagrams.length} diagrams via ${MODEL} (proxy: ${PROXY})...\n`);

  for (const d of diagrams) {
    console.log(`[${d.filename}] Generating...`);
    try {
      const data = callAPI(d.prompt);
      if (data.error) {
        console.log(`  ERROR: ${JSON.stringify(data.error)}`);
        continue;
      }
      const fp = extractAndSaveImage(data, d.filename);
      if (fp) {
        console.log(`  ✅ Saved: ${fp}`);
      } else {
        console.log(`  ❌ No image extracted`);
      }
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
    }
  }
}

main();
