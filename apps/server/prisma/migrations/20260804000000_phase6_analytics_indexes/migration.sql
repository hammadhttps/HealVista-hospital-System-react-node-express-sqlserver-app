-- Phase 6.8: indexes for the operational analytics queries.
-- The overview query date-filters across appointment slots, patients,
-- payments, prescriptions, lab orders and consultation notes; these indexes
-- serve those range scans. All additive, all safe on a live table.
--
-- IF NOT EXISTS on every statement: these indexes were already present in the
-- target database when this migration was first deployed, so a bare CREATE
-- INDEX aborted the whole deploy with 42P07. Index creation is naturally
-- idempotent to express, and a migration that cannot be re-run against a
-- database already in the desired state is a migration that blocks every
-- migration behind it.

-- Filter: slots by startTime range (appointmentsPerDay, utilisation)
CREATE INDEX IF NOT EXISTS "appointment_slots_startTime_idx" ON "appointment_slots"("startTime");

-- Filter: appointments by department (appointmentsPerDepartment, revenueByDepartment)
CREATE INDEX IF NOT EXISTS "appointments_departmentId_idx" ON "appointments"("departmentId");

-- Filter: signed notes by createdAt range (topDiagnoses)
CREATE INDEX IF NOT EXISTS "consultation_notes_signedAt_createdAt_idx" ON "consultation_notes"("signedAt", "createdAt");

-- Filter: lab orders by orderedAt range (topLabTests)
CREATE INDEX IF NOT EXISTS "lab_orders_orderedAt_idx" ON "lab_orders"("orderedAt");

-- Filter: patients by createdAt range (patientGrowth)
CREATE INDEX IF NOT EXISTS "patients_createdAt_idx" ON "patients"("createdAt");

-- Filter: succeeded payments by createdAt range (revenue aggregates)
CREATE INDEX IF NOT EXISTS "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- Filter: prescriptions by createdAt range (topMedicines)
CREATE INDEX IF NOT EXISTS "prescriptions_createdAt_idx" ON "prescriptions"("createdAt");
