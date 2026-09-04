import StatusBadge from "@/components/StatusBadge";

const locations = ["Pune Plant", "Mumbai WH", "Delhi Depot", "Chennai Hub"];
const materials = [
  { name: "Polypropylene Granules", pune: { qty: 4200, days: 15 }, mumbai: { qty: 1800, days: 6 }, delhi: { qty: 0, days: 0 }, chennai: { qty: 800, days: 4 } },
  { name: "Stearic Acid", pune: { qty: 180, days: 4 }, mumbai: { qty: 0, days: 0 }, delhi: { qty: 50, days: 3 }, chennai: { qty: 0, days: 0 } },
  { name: "HDPE Resin", pune: { qty: 6200, days: 20 }, mumbai: { qty: 3600, days: 18 }, delhi: { qty: 1200, days: 12 }, chennai: { qty: 2400, days: 15 } },
  { name: "Sodium Lauryl Sulphate", pune: { qty: 1050, days: 12 }, mumbai: { qty: 400, days: 8 }, delhi: { qty: 200, days: 6 }, chennai: { qty: 150, days: 5 } },
  { name: "Titanium Dioxide", pune: { qty: 440, days: 8 }, mumbai: { qty: 200, days: 6 }, delhi: { qty: 100, days: 4 }, chennai: { qty: 320, days: 10 } },
  { name: "Caustic Soda Flakes", pune: { qty: 1800, days: 22 }, mumbai: { qty: 1000, days: 18 }, delhi: { qty: 600, days: 14 }, chennai: { qty: 400, days: 10 } },
  { name: "HDPE Bottle 5L", pune: { qty: 5200, days: 12 }, mumbai: { qty: 3000, days: 9 }, delhi: { qty: 0, days: 0 }, chennai: { qty: 1800, days: 8 } },
  { name: "Citric Acid Monohydrate", pune: { qty: 280, days: 11 }, mumbai: { qty: 100, days: 7 }, delhi: { qty: 0, days: 0 }, chennai: { qty: 60, days: 5 } },
];

const transfers = [
  { source: "Mumbai WH", dest: "Pune Plant", material: "HDPE Resin", qty: "2,000 kg", dispatch: "21 Mar 2026", eta: "23 Mar 2026", status: "In Transit" },
  { source: "Delhi Depot", dest: "Chennai Hub", material: "Caustic Soda", qty: "500 kg", dispatch: "20 Mar 2026", eta: "25 Mar 2026", status: "In Transit" },
  { source: "Pune Plant", dest: "Mumbai WH", material: "Shrink Labels", qty: "5,000 pcs", dispatch: "22 Mar 2026", eta: "23 Mar 2026", status: "Delivered" },
];

function getCoverageColor(days: number) {
  if (days === 0) return "bg-muted text-muted-foreground";
  if (days < 7) return "bg-danger/10 text-danger";
  if (days < 14) return "bg-warning/10 text-warning";
  return "bg-success/10 text-success";
}

export default function MultiLocationInventory() {
  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold animate-fade-in-up">Multi-Location Inventory</h2>
      <div className="bg-card rounded-lg border border-border overflow-hidden animate-fade-in-up stagger-1">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-secondary/50 border-b border-border">
                <th className="text-left px-3 py-2.5 font-medium text-muted-foreground">Material</th>
                {locations.map(l => <th key={l} className="text-center px-3 py-2.5 font-medium text-muted-foreground">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {materials.map((m, i) => (
                <tr key={i} className="border-b border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 font-medium">{m.name}</td>
                  {[m.pune, m.mumbai, m.delhi, m.chennai].map((loc, j) => (
                    <td key={j} className="px-3 py-2 text-center">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium tabular-nums ${getCoverageColor(loc.days)}`}>
                        {loc.qty > 0 ? `${loc.qty.toLocaleString()} (${loc.days}d)` : "—"}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-card rounded-lg border border-border p-4 animate-fade-in-up stagger-2">
        <h3 className="text-sm font-semibold mb-3">Stock In-Transit</h3>
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-border">
            {["Source", "Destination", "Material", "Qty", "Dispatched", "ETA", "Status"].map(h => <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>)}
          </tr></thead>
          <tbody>
            {transfers.map((t, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{t.source}</td><td className="px-3 py-2">{t.dest}</td>
                <td className="px-3 py-2 font-medium">{t.material}</td><td className="px-3 py-2 tabular-nums">{t.qty}</td>
                <td className="px-3 py-2">{t.dispatch}</td><td className="px-3 py-2">{t.eta}</td>
                <td className="px-3 py-2"><StatusBadge status={t.status === "Delivered" ? "green" : "blue"} label={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
