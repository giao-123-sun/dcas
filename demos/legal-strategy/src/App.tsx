import { useState, useCallback } from "react";
import type { CaseInput, SimulationOutput } from "./engine.js";
import { runSimulation } from "./engine.js";
import { InputPanel } from "./components/InputPanel.js";
import { StrategyCards } from "./components/StrategyCards.js";
import { ReasoningPanel } from "./components/ReasoningPanel.js";

export function App() {
  const [input, setInput] = useState<CaseInput>({
    caseType: "labor_dispute",
    claimAmount: 120000,
    evidenceStrength: 7,
    judgeIndex: 0,
  });
  const [result, setResult] = useState<SimulationOutput | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulate = useCallback(async () => {
    setLoading(true);
    try {
      const output = await runSimulation(input, 100);
      setResult(output);
    } finally {
      setLoading(false);
    }
  }, [input]);

  const handleInputChange = useCallback((newInput: CaseInput) => {
    setInput(newInput);
    setResult(null);
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header style={{ textAlign: "center", marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "#f1f5f9" }}>
          DCAS 法律策略模拟器
        </h1>
        <p style={{ color: "#94a3b8", marginTop: 8 }}>
          Decision-Centric Agent System — 蒙特卡洛模拟驱动的法律策略评估
        </p>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24 }}>
        <InputPanel
          input={input}
          onChange={handleInputChange}
          onSimulate={handleSimulate}
          loading={loading}
        />
        <div>
          {result ? (
            <>
              <StrategyCards
                strategies={result.kpiSummary}
                claimAmount={input.claimAmount}
              />
              <ReasoningPanel strategies={result.kpiSummary} />
            </>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 400,
                background: "#1e293b",
                borderRadius: 12,
                color: "#64748b",
                fontSize: 16,
              }}
            >
              {loading ? "模拟中..." : "设置案件参数后点击「开始模拟」"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
