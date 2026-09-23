import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CHART_COLORS, SERIES, CHART_TOOLTIP_STYLE } from "@/lib/chart-colors";
import { PageIcon } from "@/components/app/page-icon";

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
    <div className="px-6 py-5 space-y-6">
      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">Inventory health scoring</span>
        </h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-6 text-center">
          <div className="text-display-4xl font-semibold text-warning tabular-nums">{score}</div>
          <div className="text-body-md text-muted-foreground mt-1">/ 100</div>
          <div className="text-body-sm font-medium text-warning mt-2">Below 80 target</div>
        </div>
        {[
          { label: "Stock availability", score: 81, color: "text-success" },
          { label: "Turnover efficiency", score: 68, color: "text-warning" },
          { label: "Excess & obsolescence", score: 72, color: "text-warning" },
        ].map((s) => (
          <div key={s.label}>
            <div className={`text-display-xl leading-none tabular-nums ${s.color}`}>{s.score}</div>
            <div className="text-body-sm text-muted-foreground mt-1">{s.label}</div>
            <div className="w-full h-1.5 bg-secondary rounded-full mt-3">
              <div className={`h-full rounded-full ${s.score >= 80 ? "bg-success" : "bg-warning"}`} style={{ width: `${s.score}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div>
            <h3 className="text-body-md font-semibold mb-3">Score trend (12 months)</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={scoreHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
                <YAxis width={44} domain={[50, 100]} tick={{ fontSize: 11 }} stroke={CHART_COLORS.axis} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE}  formatter={(v: number | string) => (typeof v === "number" ? v.toLocaleString() : v)} />
                <Line type="monotone" dataKey="score" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto">
            <table className="data-table w-full text-body-md">
              <thead><tr className="border-b border-border">
                {["Material", "Score", "Main penalty", "Suggested action"].map(h => <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground">{h}</th>)}
              </tr></thead>
              <tbody>
                {materialScores.map((m, i) => (
                  <tr key={i} className="border-b border-border hover:bg-sunken">
                    <td className="px-3 py-2 font-medium">{m.material}</td>
                    <td className="px-3 py-2">
                      <span className={`font-semibold tabular-nums ${m.score >= 80 ? "text-success" : m.score >= 60 ? "text-warning" : "text-danger"}`}>{m.score}</span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{m.penalty}</td>
                    <td className="px-3 py-2">{m.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="text-body-md font-semibold mb-3">Top 5 recommendations</h3>
          <div className="space-y-3">
            {recommendations.map((r, i) => (
              <div key={i} className="p-3 rounded-lg bg-secondary/60 text-body-sm leading-relaxed">
                <span className="font-semibold text-muted-foreground mr-1">{i + 1}.</span> {r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
