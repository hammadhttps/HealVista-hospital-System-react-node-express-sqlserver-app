import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";

vi.mock("../config/db", () => ({
  prisma: {
    appointmentSlot: { findUnique: vi.fn(), update: vi.fn() },
    appointment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    patient: { findUnique: vi.fn() },
    doctor: { findUnique: vi.fn() },
    // Guardian links: ownership checks ask "is this the patient *or* an authorised
    // guardian?", so every scoped path may consult this.
    patientRelationship: { findMany: vi.fn() },
    favouriteDoctor: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../config/redis", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));
vi.mock("../config/bull", () => ({
  addReminderJob: vi.fn(),
  addNotificationJob: vi.fn(),
  smsQueue: null,
  reminderQueue: null,
}));
vi.mock("../utils/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./slot.service", () => ({ unlockSlotInRedis: vi.fn() }));
vi.mock("./notification.service", () => ({
  dispatchNotification: vi.fn(),
  storeReminderJobId: vi.fn(),
  clearReminderJobIds: vi.fn(),
  getReminderJobIds: vi.fn(),
}));
vi.mock("./chat.service", () => ({ createThreadForAppointment: vi.fn() }));

describe("AppointmentService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: the caller is nobody's guardian. Tests that exercise guardian access
    // override this explicitly, so a widened scope can never pass by accident.
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([] as never);
  });

  describe("bookAppointment", () => {
    it("should throw if slot not found", async () => {
      vi.mocked(prisma.appointmentSlot.findUnique).mockResolvedValue(null);
      const { bookAppointment } = await import("./appointment.service.js");
      await expect(
        bookAppointment({ patientId: "p1", doctorId: "d1", slotId: "s1" }),
      ).rejects.toThrow("Slot not found");
    });

    it("should throw if slot is blocked", async () => {
      vi.mocked(prisma.appointmentSlot.findUnique).mockResolvedValue({
        id: "s1",
        doctorId: "d1",
        isBlocked: true,
        isBooked: false,
        appointment: null,
      } as any);
      const { bookAppointment } = await import("./appointment.service.js");
      await expect(
        bookAppointment({ patientId: "p1", doctorId: "d1", slotId: "s1" }),
      ).rejects.toThrow("blocked");
    });

    it("should throw if slot already booked", async () => {
      vi.mocked(prisma.appointmentSlot.findUnique).mockResolvedValue({
        id: "s1",
        doctorId: "d1",
        isBlocked: false,
        isBooked: true,
        appointment: null,
      } as any);
      const { bookAppointment } = await import("./appointment.service.js");
      await expect(
        bookAppointment({ patientId: "p1", doctorId: "d1", slotId: "s1" }),
      ).rejects.toThrow("already booked");
    });

    it("should create appointment successfully", async () => {
      vi.mocked(prisma.appointmentSlot.findUnique).mockResolvedValue({
        id: "s1",
        doctorId: "d1",
        isBlocked: false,
        isBooked: false,
        appointment: null,
      } as any);

      vi.mocked(prisma.patient.findUnique).mockResolvedValue({
        id: "p1",
        userId: "u1",
      } as any);

      vi.mocked(prisma.appointment.create).mockResolvedValue({
        id: "apt-1",
        appointmentNo: "APT-123",
        qrToken: "qr-123",
        status: "PENDING_PAYMENT",
        patient: { fullName: "John", mrn: "MRN-1" },
        doctor: { fullName: "Dr. Smith" },
        slot: { id: "s1", startTime: new Date(), endTime: new Date() },
      } as any);

      const { bookAppointment } = await import("./appointment.service.js");
      const result = await bookAppointment({
        patientId: "p1",
        doctorId: "d1",
        slotId: "s1",
      });

      expect(result).toBeDefined();
      expect(prisma.appointment.create).toHaveBeenCalledTimes(1);
      expect(prisma.appointmentSlot.update).toHaveBeenCalledWith({
        where: { id: "s1" },
        data: { isBooked: true },
      });
    });
  });

  describe("cancelAppointment", () => {
    it("should cancel and free the slot", async () => {
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "apt-1",
        slotId: "s1",
        doctorId: "d1",
        status: "CONFIRMED",
        slot: { id: "s1" },
      } as any);

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          appointment: {
            update: vi.fn().mockResolvedValue({ id: "apt-1", status: "CANCELLED" }),
          },
          appointmentSlot: { update: vi.fn() },
        };
        return fn(tx);
      });

      const { cancelAppointment } = await import("./appointment.service.js");
      const result = await cancelAppointment("apt-1", "Changed mind", "u1", {
        userId: "u1",
        role: "RECEPTIONIST",
      });
      expect(result).toBeDefined();
    });

    it("should not cancel already cancelled appointment", async () => {
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "apt-1",
        slotId: "s1",
        status: "CANCELLED",
        slot: { id: "s1" },
      } as any);

      const { cancelAppointment } = await import("./appointment.service.js");
      await expect(
        cancelAppointment("apt-1", "reason", "u1", { userId: "u1", role: "RECEPTIONIST" }),
      ).rejects.toThrow("Cannot cancel");
    });

    it("should refuse to cancel another patient's appointment", async () => {
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "apt-1",
        slotId: "s1",
        status: "CONFIRMED",
        slot: { id: "s1" },
        patient: { userId: "someone-else" },
        doctor: { userId: "d-user" },
      } as any);

      const { cancelAppointment } = await import("./appointment.service.js");
      await expect(
        cancelAppointment("apt-1", "reason", "attacker", {
          userId: "attacker",
          role: "PATIENT",
        }),
      ).rejects.toThrow("Not authorised");
    });
  });

  describe("appointment authorisation", () => {
    it("scopes a PATIENT's list query to their own patient record", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-self" } as any);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service.js");
      // Asking for someone else's appointments must not widen the scope.
      await getAppointments({ patientId: "p-other" }, { userId: "u1", role: "PATIENT" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      // Scoped to the caller's own record only — no guardian links exist here, and
      // the requested "p-other" was discarded rather than honoured.
      expect(where.patientId).toEqual({ in: ["p-self"] });
    });

    it("widens a PATIENT's scope to dependants they may book for", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-self" } as any);
      vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
        { dependentPatientId: "p-child" },
      ] as never);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service.js");
      await getAppointments({}, { userId: "u1", role: "PATIENT" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      expect(where.patientId).toEqual({ in: ["p-self", "p-child"] });
    });

    it("lets a guardian narrow the list to one dependant", async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-self" } as any);
      vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
        { dependentPatientId: "p-child" },
      ] as never);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service.js");
      await getAppointments({ patientId: "p-child" }, { userId: "u1", role: "PATIENT" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      expect(where.patientId).toBe("p-child");
    });

    it("refuses to narrow to a patient outside the guardian's scope", async () => {
      // The attack this guards: request ?patientId=<stranger> and have the scope
      // honour it because a dependant list happens to be non-empty.
      vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-self" } as any);
      vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
        { dependentPatientId: "p-child" },
      ] as never);
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service.js");
      await getAppointments({ patientId: "p-stranger" }, { userId: "u1", role: "PATIENT" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      expect(where.patientId).toEqual({ in: ["p-self", "p-child"] });
    });

    it("does not scope a RECEPTIONIST's list query", async () => {
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service.js");
      await getAppointments({}, { userId: "u2", role: "RECEPTIONIST" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      expect(where.patientId).toBeUndefined();
      expect(where.doctorId).toBeUndefined();
    });

    it("refuses to return another patient's appointment by id", async () => {
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "apt-1",
        patient: { userId: "owner" },
        doctor: { userId: "d-user" },
      } as any);

      const { getAppointmentById } = await import("./appointment.service.js");
      await expect(
        getAppointmentById("apt-1", { userId: "attacker", role: "PATIENT" }),
      ).rejects.toThrow("Not authorised");
    });
  });

  describe("checkInAppointment", () => {
    it("should reject check-in outside window", async () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 5);

      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "apt-1",
        status: "CONFIRMED",
        slot: { startTime: futureDate },
        patient: { id: "p1" },
      } as any);

      const { checkInAppointment } = await import("./appointment.service.js");
      await expect(checkInAppointment("qr-token", "u1")).rejects.toThrow("Too early");
    });
  });
});
