"use client";

import { useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";

import { DownloadIcon, FilterIcon, QcHoldIcon, SearchIcon, WarningIcon } from "@/components/icons/chronos";
import StatusBadge from "@/components/StatusBadge";
import KPICard from "@/components/KPICard";
import {
  ebomParts, supplierLots, asBuiltRecords, warrantyClaims,
  populationAtRiskData, traceabilityAlerts, suppliers,
} from "@/data/traceability";
import { btnPrimary, btnSecondary } from "@/components/app/controls";
import { PageIcon } from "@/components/app/page-icon";

type TabKey = "search" | "risk";

// --- 8D Report generator ---
function generate8DReport(serial: string, ebom: typeof ebomParts[0] | undefined, mbom: typeof asBuiltRecords[0] | undefined, sbom: typeof supplierLots[0] | undefined) {
  const lines = [
    "═══════════════════════════════════════════════",
    "         8D INVESTIGATION REPORT",
    "═══════════════════════════════════════════════",
    `Report Date: ${new Date().toLocaleDateString("en-IN")}`,
    `Unit Serial: ${serial}`,
    "",
    "─── D1: TEAM ───",
    "Lead: Quality Engineering",
    "Members: Production, Procurement, R&D",
    "",
    "─── D2: PROBLEM DESCRIPTION ───",
  ];
  if (mbom) {
    const claims = warrantyClaims.filter(c => c.unitSerial === serial);
    claims.forEach(c => lines.push(`Claim ${c.claimId}: ${c.defectDescription}`));
  }
  lines.push("", "─── D3: CONTAINMENT ───");
  if (sbom?.quarantine) lines.push(`Lot ${sbom.internalLotNumber} quarantined.`);
  lines.push("", "─── D4: ROOT CAUSE (EBOM) ───");
  if (ebom) {
    lines.push(`Part: ${ebom.partNumber} — ${ebom.partName}`);
    lines.push(`Current Rev: ${ebom.currentRevision}, ECO: ${ebom.ecoNumber}`);
    if (mbom && mbom.revisionUsedAtBuild !== ebom.currentRevision) {
      lines.push(`⚠ REVISION MISMATCH: Built with Rev ${mbom.revisionUsedAtBuild}, current is Rev ${ebom.currentRevision}`);
    }
  }
  lines.push("", "─── D5: ROOT CAUSE (MBOM / Process) ───");
  if (mbom) {
    lines.push(`Work Order: ${mbom.workOrderId}, Date: ${mbom.assemblyDate}`);
    lines.push(`Operator: ${mbom.operatorId}, Line: ${mbom.assemblyLine}`);
    mbom.processParams.filter(p => !p.inSpec).forEach(p => lines.push(`⚠ OUT OF SPEC: ${p.param} = ${p.value} (spec: ${p.spec})`));
  }
  lines.push("", "─── D6: ROOT CAUSE (SBOM / Supplier) ───");
  if (sbom) {
    lines.push(`Supplier: ${sbom.supplierName}, Lot: ${sbom.internalLotNumber}`);
    lines.push(`Inspection: ${sbom.inspectionStatus}, Grade: ${sbom.materialGrade}`);
    const sup = suppliers.find(s => s.id === sbom.supplierId);
    if (sup && !sup.asl) lines.push("⚠ SUPPLIER NOT ON APPROVED LIST");
  }
  lines.push("", "─── D7: CORRECTIVE ACTIONS ───", "[ To be determined by 8D team ]");
  lines.push("", "─── D8: VERIFICATION ───", "[ Pending ]");
  lines.push("", "═══════════════════════════════════════════════");
  return lines.join("\n");
}

export default function Traceability() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || "";
  const [activeTab, setActiveTab] = useState<TabKey>("search");
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [submittedQuery, setSubmittedQuery] = useState(initialSearch);

  // Population at Risk filters
  const [riskLot, setRiskLot] = useState("");
  const [riskSupplier, setRiskSupplier] = useState("");
  const [riskLine, setRiskLine] = useState("");

  const criticalAlerts = traceabilityAlerts.filter(a => a.severity === "critical" && !a.resolved);

  const handleSearch = () => setSubmittedQuery(searchQuery.trim());

  // Search results
  const searchResults = useMemo(() => {
    if (!submittedQuery) return null;
    const q = submittedQuery.toUpperCase();

    // Find matching EBOM
    const ebom = ebomParts.find(p => p.partNumber.toUpperCase() === q || p.partName.toUpperCase().includes(q));
    // Find matching lots
    const lots = supplierLots.filter(l => l.internalLotNumber.toUpperCase() === q || l.supplierLotNumber.toUpperCase().includes(q) || l.partNumber.toUpperCase() === q);
    // Find matching as-built records
    const builds = asBuiltRecords.filter(r =>
      r.unitSerial.toUpperCase() === q ||
      r.lotsConsumed.some(lc => lc.lotNumber.toUpperCase() === q || lc.partNumber.toUpperCase() === q)
    );
    // Find linked warranty claims
    const claims = warrantyClaims.filter(c =>
      c.unitSerial.toUpperCase() === q ||
      c.rootCauseLotNumber.toUpperCase() === q
    );

    if (!ebom && lots.length === 0 && builds.length === 0) return null;

    return { ebom, lots, builds, claims };
  }, [submittedQuery]);

  // Population at risk filtered
  const filteredRisk = useMemo(() => {
    return populationAtRiskData.filter(d => {
      if (riskLot && !d.lotNumber.toLowerCase().includes(riskLot.toLowerCase())) return false;
      if (riskSupplier && d.supplier !== riskSupplier) return false;
      if (riskLine && d.assemblyLine !== riskLine) return false;
      return true;
    });
  }, [riskLot, riskSupplier, riskLine]);

  const riskTotals = useMemo(() => {
    return filteredRisk.reduce((acc, d) => ({
      totalProduced: acc.totalProduced + d.funnel.totalProduced,
      lotUsedInBuild: acc.lotUsedInBuild + d.funnel.lotUsedInBuild,
      assembledPassedQC: acc.assembledPassedQC + d.funnel.assembledPassedQC,
      shippedToField: acc.shippedToField + d.funnel.shippedToField,
      atRiskInField: acc.atRiskInField + d.funnel.atRiskInField,
      alreadyReturned: acc.alreadyReturned + d.alreadyReturned,
    }), { totalProduced: 0, lotUsedInBuild: 0, assembledPassedQC: 0, shippedToField: 0, atRiskInField: 0, alreadyReturned: 0 });
  }, [filteredRisk]);

  const riskRatio = riskTotals.shippedToField > 0 ? (riskTotals.atRiskInField / riskTotals.shippedToField) * 100 : 0;
  const containmentPriority = riskRatio > 8 ? "Critical" : riskRatio > 4 ? "High" : "Monitor";
  const containmentColor = riskRatio > 8 ? "red" : riskRatio > 4 ? "amber" : "gray";

  const export8D = () => {
    if (!searchResults || searchResults.builds.length === 0) return;
    const build = searchResults.builds[0];
    const lot = searchResults.lots[0];
    const report = generate8DReport(build.unitSerial, searchResults.ebom, build, lot);
    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `8D-Report-${build.unitSerial}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSerialList = () => {
    const lines = ["Serial Number,Lot Number,Assembly Line,Status"];
    filteredRisk.forEach(d => {
      for (let i = 0; i < d.funnel.atRiskInField; i++) {
        lines.push(`SN-AFFECTED-${String(i + 1).padStart(4, '0')},${d.lotNumber},${d.assemblyLine},At Risk`);
      }
    });
    const blob = new Blob([lines.slice(0, 101).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "affected-serials.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: TabKey; label: string }[] = [
    { key: "search", label: "Trace search" },
    { key: "risk", label: "Population at risk" },
  ];

  return (
    <div className="px-6 py-5 space-y-6">
      {/* Critical Alert Banner */}
      {criticalAlerts.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 flex items-center gap-3">
          <WarningIcon className="w-4 h-4 text-danger flex-shrink-0" />
          <span className="text-danger font-semibold text-body-md">⚠ {criticalAlerts.length} critical traceability alert{criticalAlerts.length > 1 ? "s" : ""} — {criticalAlerts.map(a => a.title).join(" · ")}</span>
        </div>
      )}

      <h1 className="flex items-center gap-2.5 font-display text-display-page text-foreground">
          <PageIcon />
          <span className="min-w-0">BOM traceability</span>
        </h1>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 text-body-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === t.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{t.label}</button>
        ))}
      </div>

      {/* ═══════ TAB: Trace Search ═══════ */}
      {activeTab === "search" && (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
                placeholder="Search by serial number, lot number, or part number..."
                className="w-full h-10 pl-10 pr-3 rounded-lg border border-input bg-card text-body-md identifier" />
            </div>
            <button onClick={handleSearch} className={`${btnPrimary} h-10 px-5`}>Search</button>
          </div>

          <div className="text-caption text-muted-foreground">
            Try: <button onClick={() => { setSearchQuery("SN-2026-00451"); setSubmittedQuery("SN-2026-00451"); }} className="identifier text-foreground underline underline-offset-2 hover:text-foreground">SN-2026-00451</button> (clean) ·{" "}
            <button onClick={() => { setSearchQuery("SN-2026-00467"); setSubmittedQuery("SN-2026-00467"); }} className="identifier text-foreground underline underline-offset-2 hover:text-foreground">SN-2026-00467</button> (revision mismatch) ·{" "}
            <button onClick={() => { setSearchQuery("LOT-2026-0189"); setSubmittedQuery("LOT-2026-0189"); }} className="identifier text-foreground underline underline-offset-2 hover:text-foreground">LOT-2026-0189</button> (suspect lot)
          </div>

          {/* Results */}
          {searchResults && (
            <div className="space-y-4">
              {/* 3-Layer Result Cards */}
              {/* EBOM Layer */}
              {searchResults.ebom && (
                <div className="surface-panel p-4 space-y-2">
                  <h4 className="text-body-sm font-semibold text-ebom tracking-wide flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-ebom" /> EBOM — Engineering Bill of Materials
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-body-sm">
                    <div><span className="text-muted-foreground block">Part number</span><span className="identifier font-medium">{searchResults.ebom.partNumber}</span></div>
                    <div><span className="text-muted-foreground block">Part name</span><span className="font-medium">{searchResults.ebom.partName}</span></div>
                    <div><span className="text-muted-foreground block">Revision</span><span className="font-semibold text-ebom">{searchResults.ebom.currentRevision}</span></div>
                    <div><span className="text-muted-foreground block">ECO number</span><span className="identifier">{searchResults.ebom.ecoNumber}</span></div>
                    <div><span className="text-muted-foreground block">Effectivity</span><span>{searchResults.ebom.effectivityStart} — {searchResults.ebom.effectivityEnd}</span></div>
                    <div>
                      {searchResults.ebom.ctq && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-danger/10 text-danger">CTQ</span>}
                    </div>
                  </div>
                  {/* Amber highlight if revision mismatch */}
                  {searchResults.builds.some(b => b.revisionUsedAtBuild !== searchResults.ebom!.currentRevision) && (
                    <div className="bg-warning/10 border border-warning/30 rounded px-3 py-1.5 text-body-sm text-warning font-medium">
                      ⚠ Revision at build time differs from current active revision
                    </div>
                  )}
                </div>
              )}

              {/* MBOM Layer */}
              {searchResults.builds.map((build, idx) => (
                <div key={idx} className={`surface-panel p-4 space-y-2 ${build.qcResult !== "pass" || build.processParams.some(p => !p.inSpec) ? "border-danger/30 bg-danger/5" : ""}`}>
                  <h4 className="text-body-sm font-semibold text-mbom tracking-wide flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-mbom" /> MBOM — Manufacturing Build Record
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-body-sm">
                    <div><span className="text-muted-foreground block">Serial</span><span className="identifier font-medium">{build.unitSerial}</span></div>
                    <div><span className="text-muted-foreground block">Assembly date</span><span className="font-medium">{build.assemblyDate}</span></div>
                    <div><span className="text-muted-foreground block">Work centre</span><span>{build.workCentre}</span></div>
                    <div><span className="text-muted-foreground block">Operator</span><span>{build.operatorId}</span></div>
                    <div><span className="text-muted-foreground block">Lots consumed</span><span className="identifier">{build.lotsConsumed.map(l => l.lotNumber).join(", ")}</span></div>
                    <div><span className="text-muted-foreground block">QC result</span>
                      <StatusBadge status={build.qcResult === "pass" ? "green" : build.qcResult === "fail" ? "red" : "amber"} label={build.qcResult.toUpperCase()} />
                    </div>
                  </div>
                  {build.processParams.some(p => !p.inSpec) && (
                    <div className="bg-danger/10 border border-danger/30 rounded px-3 py-1.5 text-body-sm text-danger font-medium">
                      ⚠ Process parameter(s) out of spec: {build.processParams.filter(p => !p.inSpec).map(p => `${p.param} = ${p.value} (spec: ${p.spec})`).join("; ")}
                    </div>
                  )}
                </div>
              ))}

              {/* SBOM Layer */}
              {searchResults.lots.map((lot, idx) => (
                <div key={idx} className={`surface-panel p-4 space-y-2 ${lot.inspectionStatus === "failed" || lot.quarantine ? "border-danger/30 bg-danger/5" : ""}`}>
                  <h4 className="text-body-sm font-semibold text-sbom tracking-wide flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sbom" /> SBOM — Supplier Bill of Materials
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-body-sm">
                    <div><span className="text-muted-foreground block">Supplier</span><span className="font-medium">{lot.supplierName}</span></div>
                    <div><span className="text-muted-foreground block">Supplier lot</span><span className="identifier">{lot.supplierLotNumber}</span></div>
                    <div><span className="text-muted-foreground block">Heat number</span><span className="identifier">{lot.heatNumber}</span></div>
                    <div><span className="text-muted-foreground block">GR date</span><span>{lot.goodsReceiptDate}</span></div>
                    <div><span className="text-muted-foreground block">CoC ref</span><span className="identifier">{lot.cocReference}</span></div>
                    <div><span className="text-muted-foreground block">Inspection</span>
                      <StatusBadge status={lot.inspectionStatus === "passed" ? "green" : lot.inspectionStatus === "failed" ? "red" : "amber"} label={lot.inspectionStatus.toUpperCase()} />
                    </div>
                  </div>
                  {(lot.inspectionStatus === "failed" || lot.materialGrade.includes("Industrial")) && (
                    <div className="bg-danger/10 border border-danger/30 rounded px-3 py-1.5 text-body-sm text-danger font-medium">
                      ⚠ Inspection failed or material grade mismatch: {lot.materialGrade}
                    </div>
                  )}
                </div>
              ))}

              {/* Check Summaries */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {/* Design Check */}
                {(() => {
                  const revMismatch = searchResults.builds.some(b => searchResults.ebom && b.revisionUsedAtBuild !== searchResults.ebom.currentRevision);
                  return (
                    <div className={`bg-card rounded-lg border p-3 ${revMismatch ? "border-danger/30" : "border-success/30"}`}>
                      <div className="flex items-center gap-2 text-body-sm font-semibold mb-1">
                        <span className={revMismatch ? "text-danger" : "text-success"}>{revMismatch ? "✗" : "✓"}</span>
                        <span className="text-ebom">Design check</span>
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {revMismatch
                          ? `Revision mismatch — built with Rev ${searchResults.builds[0]?.revisionUsedAtBuild}, current is Rev ${searchResults.ebom?.currentRevision}`
                          : "Correct revision active on build date"}
                      </p>
                    </div>
                  );
                })()}

                {/* Process Check */}
                {(() => {
                  const oosParams = searchResults.builds.flatMap(b => b.processParams.filter(p => !p.inSpec));
                  return (
                    <div className={`bg-card rounded-lg border p-3 ${oosParams.length > 0 ? "border-danger/30" : "border-success/30"}`}>
                      <div className="flex items-center gap-2 text-body-sm font-semibold mb-1">
                        <span className={oosParams.length > 0 ? "text-danger" : "text-success"}>{oosParams.length > 0 ? "✗" : "✓"}</span>
                        <span className="text-mbom">Process check</span>
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {oosParams.length > 0
                          ? `${oosParams.length} parameter(s) out of spec at assembly`
                          : "All process parameters within spec"}
                      </p>
                    </div>
                  );
                })()}

                {/* Supplier Check */}
                {(() => {
                  const issues = searchResults.lots.filter(l => l.inspectionStatus === "failed" || l.quarantine || !suppliers.find(s => s.id === l.supplierId)?.asl);
                  return (
                    <div className={`bg-card rounded-lg border p-3 ${issues.length > 0 ? "border-danger/30" : "border-success/30"}`}>
                      <div className="flex items-center gap-2 text-body-sm font-semibold mb-1">
                        <span className={issues.length > 0 ? "text-danger" : "text-success"}>{issues.length > 0 ? "✗" : "✓"}</span>
                        <span className="text-sbom">Supplier check</span>
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {issues.length > 0
                          ? `Issues: ${issues.map(l => !suppliers.find(s => s.id === l.supplierId)?.asl ? "Non-ASL supplier" : l.inspectionStatus === "failed" ? "Failed inspection" : "Quarantined lot").join(", ")}`
                          : "Approved supplier, passed inspection, correct material"}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Linked warranty claims */}
              {searchResults.claims.length > 0 && (
                <div className="bg-card rounded-lg border border-danger/20 p-4 space-y-2">
                  <h4 className="text-body-sm font-semibold text-danger tracking-wide">Linked warranty claims ({searchResults.claims.length})</h4>
                  {searchResults.claims.map(c => (
                    <div key={c.claimId} className="flex items-center gap-3 text-body-sm border-b border-border last:border-0 py-1.5">
                      <span className="identifier text-foreground">{c.claimId}</span>
                      <span className="font-medium">{c.customer}</span>
                      <span className="text-muted-foreground flex-1 truncate">{c.defectDescription}</span>
                      <StatusBadge status={c.status === "open" ? "red" : c.status === "investigating" ? "amber" : "green"} label={c.status.toUpperCase()} />
                    </div>
                  ))}
                </div>
              )}

              {/* Export 8D */}
              <button onClick={export8D} className={btnPrimary}>
                <DownloadIcon className="w-4 h-4" /> Export 8D Report
              </button>
            </div>
          )}

          {submittedQuery && !searchResults && (
            <div className="p-8 text-center">
              <p className="text-body-md text-muted-foreground">No results found for "<span className="identifier">{submittedQuery}</span>"</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: Population at Risk ═══════ */}
      {activeTab === "risk" && (
        <div className="space-y-4">
          {/* Filter Panel */}
          <div>
            <div className="flex items-center gap-2 mb-3 text-body-sm font-semibold text-muted-foreground"><FilterIcon className="w-3.5 h-3.5" /> FILTERS</div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="text-body-sm text-muted-foreground block mb-1">Lot number</label>
                <input value={riskLot} onChange={e => setRiskLot(e.target.value)} placeholder="e.g. LOT-2026-0189"
                  className="w-full h-8 px-3 rounded-lg border border-input bg-background text-body-sm identifier" />
              </div>
              <div>
                <label className="text-body-sm text-muted-foreground block mb-1">Supplier</label>
                <select value={riskSupplier} onChange={e => setRiskSupplier(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-input bg-background text-body-sm">
                  <option value="">All suppliers</option>
                  {[...new Set(populationAtRiskData.map(d => d.supplier))].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-body-sm text-muted-foreground block mb-1">Assembly line</label>
                <select value={riskLine} onChange={e => setRiskLine(e.target.value)} className="w-full h-8 px-2 rounded-lg border border-input bg-background text-body-sm">
                  <option value="">All lines</option>
                  {[...new Set(populationAtRiskData.map(d => d.assemblyLine))].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={() => { setRiskLot(""); setRiskSupplier(""); setRiskLine(""); }}
                  className="h-8 px-3 bg-secondary text-foreground rounded-lg text-body-sm font-medium">Clear filters</button>
              </div>
            </div>
          </div>

          {/* Funnel */}
          <div className="space-y-3">
            <h3 className="text-body-md font-semibold">Containment funnel</h3>
            {[
              { label: "Total produced", value: riskTotals.totalProduced, pct: 100 },
              { label: "Lot used in build", value: riskTotals.lotUsedInBuild, pct: riskTotals.totalProduced > 0 ? (riskTotals.lotUsedInBuild / riskTotals.totalProduced) * 100 : 0 },
              { label: "Assembled & passed QC", value: riskTotals.assembledPassedQC, pct: riskTotals.totalProduced > 0 ? (riskTotals.assembledPassedQC / riskTotals.totalProduced) * 100 : 0 },
              { label: "Shipped to field", value: riskTotals.shippedToField, pct: riskTotals.totalProduced > 0 ? (riskTotals.shippedToField / riskTotals.totalProduced) * 100 : 0 },
              { label: "At risk in field", value: riskTotals.atRiskInField, pct: riskTotals.totalProduced > 0 ? (riskTotals.atRiskInField / riskTotals.totalProduced) * 100 : 0 },
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-body-sm text-muted-foreground w-40 text-right">{step.label}</span>
                <div className="flex-1 h-6 bg-secondary rounded overflow-hidden">
                  <div className={`h-full rounded ${i === 4 ? "bg-danger" : i === 3 ? "bg-warning" : "bg-chart-1"}`}
                    style={{ width: `${step.pct}%`, transition: "width 0.3s" }} />
                </div>
                <span className="text-body-sm font-semibold tabular-nums w-16 text-right">{step.value.toLocaleString()}</span>
              </div>
            ))}
          </div>

          {/* Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KPICard title="Units at risk in field" value={riskTotals.atRiskInField.toLocaleString()} status="red" icon={WarningIcon} />
            <KPICard title="Already returned / defective" value={riskTotals.alreadyReturned.toString()} status="amber" icon={QcHoldIcon} />
            {/* Same tile as its two neighbours. The priority is carried by the
                colour of the figure, not by a coloured edge on the card. */}
            <div className="surface-sunken min-w-0 px-4 py-3.5">
              <p className="label-caps truncate">Containment priority</p>
              <p
                className={`mt-2 text-display-xl leading-none ${
                  containmentColor === "red"
                    ? "text-danger"
                    : containmentColor === "amber"
                      ? "text-warning"
                      : "text-foreground"
                }`}
              >
                {containmentPriority}
              </p>
              <p className="mt-1.5 truncate text-body-sm text-muted-foreground">
                {riskRatio.toFixed(1)}% at-risk ratio
              </p>
            </div>
          </div>

          {/* At-risk proportion bar */}
          <div>
            <div className="flex items-center justify-between text-body-sm mb-1">
              <span className="text-muted-foreground">At-risk units as proportion of total shipped</span>
              <span className="font-semibold tabular-nums">{riskRatio.toFixed(1)}%</span>
            </div>
            <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${riskRatio > 8 ? "bg-danger" : riskRatio > 4 ? "bg-warning" : "bg-success"}`}
                style={{ width: `${Math.min(riskRatio, 100)}%`, transition: "width 0.3s" }} />
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-3">
            <button onClick={exportSerialList} className={btnPrimary}>
              <DownloadIcon className="w-4 h-4" /> Export Affected Serial List
            </button>
            <button className={btnSecondary}>
              <QcHoldIcon className="w-4 h-4" /> Generate Containment Action Plan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
