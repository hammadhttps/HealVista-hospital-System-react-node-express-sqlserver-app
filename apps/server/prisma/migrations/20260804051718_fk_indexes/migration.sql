-- Indexes for foreign keys that had none.
--
-- Postgres indexes the *referenced* side of a foreign key automatically but not
-- the referencing side, so an unindexed FK column means every join across it and
-- every cascading delete on the parent is a sequential scan. An audit of
-- pg_constraint against pg_index found fifteen such columns.
--
-- Several sit directly under queries this codebase already leans on:
-- prescription_items(prescriptionId) and lab_order_items(labOrderId, labTestId)
-- carry the analytics "top medicines"/"top lab tests" aggregates, and
-- doctor_departments(departmentId) carries the department list, which is the
-- most-requested read in the app.
--
-- NOTE: Prisma's diff again proposed dropping "document_chunks_embedding_idx",
-- the Phase 5 pgvector HNSW index. It is created in raw SQL because Prisma
-- cannot express vector index types, so it is invisible to the schema and every
-- future diff will keep proposing this. The drop has been removed deliberately —
-- letting it through turns every RAG retrieval into a sequential scan.
--
-- IF NOT EXISTS throughout, so this is safe to re-run against a database that
-- already has some of them.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_followUpOfId_idx" ON "appointments"("followUpOfId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_rescheduledFromId_idx" ON "appointments"("rescheduledFromId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "audit_logs_correctionOfId_idx" ON "audit_logs"("correctionOfId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bills_discountId_idx" ON "bills"("discountId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctor_departments_departmentId_idx" ON "doctor_departments"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "emergency_contacts_patientId_idx" ON "emergency_contacts"("patientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "favourite_doctors_doctorId_idx" ON "favourite_doctors"("doctorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "kb_articles_departmentId_idx" ON "kb_articles"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lab_order_items_labOrderId_idx" ON "lab_order_items"("labOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lab_order_items_labTestId_idx" ON "lab_order_items"("labTestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lab_orders_appointmentId_idx" ON "lab_orders"("appointmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "lab_orders_doctorId_idx" ON "lab_orders"("doctorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "patient_relationships_dependentPatientId_idx" ON "patient_relationships"("dependentPatientId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prescription_items_prescriptionId_idx" ON "prescription_items"("prescriptionId");
