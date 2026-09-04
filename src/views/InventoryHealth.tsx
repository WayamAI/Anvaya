import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CHART_COLORS, SERIES } from "@/lib/chart-colors";

const scoreHistory = [
  { month: "Apr", score: 68 }, { month: "May", score: 70 }, { month: "Jun", score: 65 },
  { month: "Jul", score: 72 }, { month: "Aug", score: 71 }, { month: "Sep", score: 73 },
  { month: "Oct", score: 69 }, { month: "Nov", score: 72 }, { month: "Dec", score: 74 },
  { month: "Jan", score: 73 }, { month: "Feb", score: 75 }, { month: "Mar", score: 74 },
];

const materialScores = [
  { material: "Stearic Acid", score: 32, penalty: "High stockout frequency", action: "Increase safety stock by 180 kg" },
  { material: "Fragrance Blend FG-04", score: 38, penalty: "Critical shortage risk", action: "Establish second vendor source" },
  { material: "EDTA Disodium Salt", score: 41, penalty: "High stockout frequency", action: "Place advance PO with Aarti Industries" },
  { material: "Shrink Labels (Type B)", score: 45, penalty: "Low turnover + shortage", action: "Review MOQ with Uflex Packaging" },
  { material: "Pine Oil", score: 48, penalty: "Supply variability", action: "Build 3-week buffer stock" },
  { material: "LDPE Granules", score: 52, penalty: "Excess stock (45d coverage)", action: "Reduce safety stock by 25%" },
  { material: "Titanium Dioxide", score: 58, penalty: "Price volatility", action: "Lock quarterly pricing contract" },
  { material: "Polypropylene Granules", score: 65, penalty: "Below target turnover", action: "Optimize order quantity" },
  { material: "Sodium Hypochlorite", score: 71, penalty: "Moderate shortage risk", action: "Monitor weekly" },
  { material: "HDPE Resin", score: 88, penalty: "None — well managed", action: "Maintain current levels" },
];

const recommendations = [
  "Reduce safety stock for HDPE Resin by 25% — currently 2.3× recommended level. Frees up ₹1.4L working capital.",
  "Place advance PO for Stearic Acid — 4 of last 6 months had stockouts. Switch to bi-weekly ordering.",
  "Negotiate quarterly pricing for Titanium Dioxide — 18% price swing in last 6 months.",
  "Consolidate Shrink Label orders (Type A + B) with Uflex for volume discount — potential 8% savings.",
  "Set up auto-reorder for Fragrance Blend FG-04 at 15-day trigger — current manual process causes delays.",
];

export default function InventoryHealth() {
  const score = 74;
  const gaugeAngle = (score / 100) * 180;

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Inventory Health Scoring</h2>
      <div className="grid grid-cols-4 gap-4 animate-fade-in-up stagger-1">
        <div className="bg-card rounded-lg border border-border p-6 text-center">
          <div className="text-5xl font-bold text-warning tabular-nums">{score}</div>
          <div className="text-sm text-muted-foreground mt-1">/ 100</div>
          <div className="text-xs font-medium text-warning mt-2">Below 80 target</div>
        </div>
        {[
          { label: "Stock Availability", score: 81, color: "text-success" },
          { label: "Turnover Efficiency", score: 68, color: "text-warning" },
          { label: "Excess & Obsolescence", score: 72, color: "text-warning" },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-lg border border-border p-4">
            <div className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.score}</div>
            <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            <div className="w-full h-1.5 bg-secondary rounded-full mt-3">
              <div className={`h-full rounded-full ${s.score >= 80 ? "bg-success" : "bg-warning"}`} style={{ width: `${s.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
            <h3 className="text-sm font-semibold mb-3">Score Trend (12 Months)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
                <YAxis domain={[50, 100]} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="score" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-3">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-secondary/50 border-b border-border">
                {["Material", "Score", "Main Penalty", "Suggested Action"].map(h => <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {materialScores.map((m, i) => (
                  <tr key={i} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium">{m.material}</td>
                    <td className="px-3 py-2">
                      <span className={`font-bold tabular-nums ${m.score >= 80 ? "text-success" : m.score >= 60 ? "text-warning" : "text-danger"}`}>{m.score}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.penalty}</td>
                    <td className="px-3 py-2">{m.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-3">
          <h3 className="text-sm font-semibold mb-3">Top 5 Recommendations</h3>
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className="p-3 rounded-md bg-accent/5 border border-accent/10 text-xs leading-relaxed">
                <span className="font-semibold text-accent mr-1">{i + 1}.</span> {r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
