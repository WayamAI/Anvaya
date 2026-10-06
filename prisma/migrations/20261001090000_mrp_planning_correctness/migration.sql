-- MRP exception for policy rules that cannot all be honoured, e.g. a maximum
-- order quantity below the order multiple.
ALTER TYPE "MrpExceptionType" ADD VALUE 'POLICY_CONFLICT';

-- Simulation runs: planned from a date other than today, never convertible.
ALTER TABLE "mrp_runs" ADD COLUMN "isSimulation" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "mrp_runs_companyId_isSimulation_status_completedAt_idx" ON "mrp_runs"("companyId", "isSimulation", "status", "completedAt");
