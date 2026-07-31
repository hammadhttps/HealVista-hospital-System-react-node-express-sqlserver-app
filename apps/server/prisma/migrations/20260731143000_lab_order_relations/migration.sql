-- LabOrder stored patientId and doctorId as bare columns with no foreign keys, so
-- nothing stopped an order pointing at a patient who does not exist. Adding the
-- relations gives Prisma the joins the lab module needs, and the database the
-- referential integrity it should have had from the start.

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_orders" ADD CONSTRAINT "lab_orders_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
