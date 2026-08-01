/* Wipe Phase 4 demo state for the demo patient so the walk is re-runnable on the
 * same UTC day. An appointment holds its slot forever (`Appointment.slotId` is
 * unique), so a completed walk leaves the earliest slot booked and a re-run would
 * find nothing inside the ±30 min check-in window. Deleting the patient's
 * appointments cascades to notes / prescriptions / lab orders / chat threads;
 * bills and lab orders that reference the appointment are nulled by the FK.
 */
import { createRequire } from "module";
import { config } from "dotenv";

config({ path: "apps/server/.env" });

const require = createRequire(import.meta.url);
const { PrismaClient } = require("../apps/server/node_modules/@prisma/client");

const PATIENT = "999fa932-aed6-4c56-80dc-e314fa0da02b"; // alex@example.com
const DOCTOR = "287c7ad6-8238-41f3-9cde-1284582bb729"; // sarah@medicore.com

const prisma = new PrismaClient();

const { count } = await prisma.appointment.deleteMany({ where: { patientId: PATIENT } });

const freed = await prisma.appointmentSlot.updateMany({
  where: { doctorId: DOCTOR, isBooked: true, appointment: { is: null } },
  data: { isBooked: false },
});

console.log(`reset: deleted ${count} appointment(s), freed ${freed.count} slot(s)`);
await prisma.$disconnect();
