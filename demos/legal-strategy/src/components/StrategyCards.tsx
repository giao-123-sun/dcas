import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

interface Strategy {
  strategyName: string;
  strategyId: string;
  rank: number;
  score: number;
  recovery: number;
  cost: number;
  speed: number;
  reasoning: string;
}

interface Props {
  strategies: Strategy[];
  claimAmount: number;
}

const COLORS = ["#22c55e", "#f59e0b", "#ef4444"];
const RANK_LABELS = ["推荐", "备选", "不推荐"];

export function StrategyCards({ strategies, claimAmount }: Props) {
  // Radar data
  const radarData = [
    {
      metric: "回收",
      fullMark: 1,
      ...Object.fromEntries(
        strategies.map((s) => [s.strategyId, s.recovery / claimAmount]),
      ),
    },
    {
      metric: "低成本",
      fullMark: 1,
      ...Object.fromEntries(
        strategies.map((s) => [s.strategyId, 1 - s.cost / claimAmount]),
      ),
    },
    {
      metric: "速度",
      fullMark: 1,
      ...Object.fromEntries(
        strategies.map((s) => [s.strategyId, 1 - s.speed / 6]),
      ),
    },
  ];

  // Bar data
  const barData = strategies.map((s) => ({
    name: s.strategyName,
    recovery: Math.round(s.recovery),
    cost: Math.round(s.cost),
    net: Math.round(s.recovery - s.cost),
  }));

  return (
    <div>
      {/* Strategy cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {strategies.map((s, i) => (
          <div
            key={s.strategyId}
            style={{
              background: "#1e293b",
              borderRadius: 12,
              padding: 20,
              border: `2px solid ${i === 0 ? "#22c55e" : "#334155"}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: COLORS[i] + "22",
                  color: COLORS[i],
                }}
              >
                #{s.rank} {RANK_LABELS[i] ?? ""}
              </span>
              <span
                style={{ fontSize: 24, fontWeight: 700, color: COLORS[i] }}
              >
                {(s.score * 100).toFixed(0)}
              </span>
            </div>
            <h3
              style={{
                fontSize: 18,
                fontWeight: 600,
                marginTop: 12,
                color: "#f1f5f9",
              }}
            >
              {s.strategyName}
            </h3>
            <div
              style={{
                marginTop: 12,
                fontSize: 13,
                color: "#94a3b8",
                lineHeight: 1.8,
              }}
            >
              <div>
                预期回收:{" "}
                <span style={{ color: "#22c55e" }}>
                  ¥{s.recovery.toLocaleString()}
                </span>
              </div>
              <div>
                预期成本:{" "}
                <span style={{ color: "#ef4444" }}>
                  ¥{s.cost.toLocaleString()}
                </span>
              </div>
              <div>
                净收益:{" "}
                <span style={{ color: "#f1f5f9", fontWeight: 600 }}>
                  ¥{(s.recovery - s.cost).toLocaleString()}
                </span>
              </div>
              <div>耗时: {s.speed}个月</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <div
          style={{
            background: "#1e293b",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
            收益对比
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical">
              <XAxis
                type="number"
                tickFormatter={(v: number) =>
                  `¥${(v / 1000).toFixed(0)}k`
                }
                stroke="#475569"
              />
              <YAxis
                type="category"
                dataKey="name"
                stroke="#94a3b8"
                width={80}
              />
              <Tooltip
                formatter={(v: number) => `¥${v.toLocaleString()}`}
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
              />
              <Bar
                dataKey="recovery"
                fill="#22c55e"
                name="回收"
                radius={[0, 4, 4, 0]}
              />
              <Bar
                dataKey="cost"
                fill="#ef4444"
                name="成本"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            background: "#1e293b",
            borderRadius: 12,
            padding: 20,
          }}
        >
          <h3 style={{ fontSize: 14, color: "#94a3b8", marginBottom: 12 }}>
            综合能力
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="metric" stroke="#94a3b8" />
              <PolarRadiusAxis domain={[0, 1]} tick={false} />
              {strategies.map((s, i) => (
                <Radar
                  key={s.strategyId}
                  dataKey={s.strategyId}
                  stroke={COLORS[i]}
                  fill={COLORS[i]}
                  fillOpacity={0.15}
                  name={s.strategyName}
                />
              ))}
              <Tooltip
                contentStyle={{
                  background: "#0f172a",
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
