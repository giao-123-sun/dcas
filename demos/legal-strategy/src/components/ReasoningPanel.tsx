interface Strategy {
  strategyName: string;
  rank: number;
  score: number;
  reasoning: string;
}

interface Props {
  strategies: Strategy[];
}

export function ReasoningPanel({ strategies }: Props) {
  return (
    <div
      style={{
        background: "#1e293b",
        borderRadius: 12,
        padding: 20,
        marginTop: 16,
      }}
    >
      <h3 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
        推理链
      </h3>
      {strategies.map((s) => (
        <div
          key={s.strategyName}
          style={{
            padding: "10px 14px",
            marginBottom: 8,
            borderRadius: 8,
            background: "#0f172a",
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <span style={{ color: "#3b82f6", fontWeight: 600 }}>
            #{s.rank} {s.strategyName}
          </span>
          <span style={{ color: "#64748b", marginLeft: 8 }}>
            得分 {(s.score * 100).toFixed(1)}
          </span>
          <div style={{ color: "#94a3b8", marginTop: 4 }}>{s.reasoning}</div>
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>
        基于蒙特卡洛模拟 | 概率预测引擎 | DCAS v0.1
      </div>
    </div>
  );
}
