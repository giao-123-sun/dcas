import type { CaseInput } from "../engine.js";

const JUDGES = [
  { name: "王法官", desc: "偏向劳动者 (78.6%)", rate: 0.786 },
  { name: "李仲裁员", desc: "中立偏保守 (65%)", rate: 0.65 },
  { name: "赵法官", desc: "强烈偏向劳动者 (82%)", rate: 0.82 },
];

interface Props {
  input: CaseInput;
  onChange: (input: CaseInput) => void;
  onSimulate: () => void;
  loading: boolean;
}

export function InputPanel({ input, onChange, onSimulate, loading }: Props) {
  const cardStyle: React.CSSProperties = {
    background: "#1e293b",
    borderRadius: 12,
    padding: 20,
  };
  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    color: "#94a3b8",
    marginBottom: 6,
    marginTop: 16,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#e2e8f0",
    fontSize: 14,
    outline: "none",
  };

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9" }}>
        案件参数
      </h2>

      <label style={labelStyle}>案件类型</label>
      <select
        style={inputStyle}
        value={input.caseType}
        onChange={(e) => onChange({ ...input, caseType: e.target.value })}
      >
        <option value="labor_dispute">劳动争议</option>
        <option value="contract_dispute">合同纠纷</option>
        <option value="ip_dispute">知识产权</option>
      </select>

      <label style={labelStyle}>诉请金额 (¥)</label>
      <input
        type="number"
        style={inputStyle}
        value={input.claimAmount}
        onChange={(e) =>
          onChange({ ...input, claimAmount: Number(e.target.value) || 0 })
        }
      />

      <label style={labelStyle}>
        证据强度:{" "}
        <strong style={{ color: "#f1f5f9" }}>
          {input.evidenceStrength}/10
        </strong>
      </label>
      <input
        type="range"
        min={1}
        max={10}
        step={0.5}
        value={input.evidenceStrength}
        style={{ width: "100%", accentColor: "#3b82f6" }}
        onChange={(e) =>
          onChange({ ...input, evidenceStrength: Number(e.target.value) })
        }
      />

      <label style={labelStyle}>仲裁员/法官</label>
      {JUDGES.map((j, i) => (
        <label
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 0",
            cursor: "pointer",
            color: input.judgeIndex === i ? "#3b82f6" : "#94a3b8",
          }}
        >
          <input
            type="radio"
            name="judge"
            checked={input.judgeIndex === i}
            onChange={() => onChange({ ...input, judgeIndex: i })}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{j.name}</div>
            <div style={{ fontSize: 12 }}>{j.desc}</div>
          </div>
        </label>
      ))}

      <button
        onClick={onSimulate}
        disabled={loading}
        style={{
          width: "100%",
          marginTop: 20,
          padding: "12px 0",
          borderRadius: 8,
          border: "none",
          background: loading ? "#334155" : "#3b82f6",
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading ? "模拟中..." : "开始模拟"}
      </button>
    </div>
  );
}
