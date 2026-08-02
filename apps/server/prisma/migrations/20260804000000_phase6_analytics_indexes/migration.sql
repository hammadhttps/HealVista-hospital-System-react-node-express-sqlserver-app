-- Phase 6.8: indexes for the operational analytics queries.
-- The overview query date-filters across appointment slots, patients,
-- payments, prescriptions, lab orders and consultation notes; these indexes
-- serve those range scans. All additive, all safe on a live table.

-- Filter: slots by startTime range (appointmentsPerDay, utilisation)
CREATE INDEX "appointment_slots_startTime_idx" ON "appointment_slots"("startTime");

-- Filter: appointments by department (appointmentsPerDepartment, revenueByDepartment)
CREATE INDEX "appointments_departmentId_idx" ON "appointments"("departmentId");

-- Filter: signed notes by createdAt range (topDiagnoses)
CREATE INDEX "consultation_notes_signedAt_createdAt_idx" ON "consultation_notes"("signedAt", "createdAt");

-- Filter: lab orders by orderedAt range (topLabTests)
CREATE INDEX "lab_orders_orderedAt_idx" ON "lab_orders"("orderedAt");

-- Filter: patients by createdAt range (patientGrowth)
CREATE INDEX "patients_createdAt_idx" ON "patients"("createdAt");

-- Filter: succeeded payments by createdAt range (revenue aggregates)
CREATE INDEX "payments_status_createdAt_idx" ON "payments"("status", "createdAt");

-- Filter: prescriptions by createdAt range (topMedicines)
CREATE INDEX "prescriptions_createdAt_idx" ON "prescriptions"("createdAt");
