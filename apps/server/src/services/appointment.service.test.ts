import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db";

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
    favouriteDoctor: { create: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("../config/redis", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));
vi.mock("../config/bull", () => ({
  addReminderJob: vi.fn(),
  addNotificationJob: vi.fn(),
  emailQueue: null,
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
  });

  describe("bookAppointment", () => {
    it("should throw if slot not found", async () => {
      vi.mocked(prisma.appointmentSlot.findUnique).mockResolvedValue(null);
      const { bookAppointment } = await import("./appointment.service");
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
      const { bookAppointment } = await import("./appointment.service");
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
      const { bookAppointment } = await import("./appointment.service");
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

      const { bookAppointment } = await import("./appointment.service");
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

      const { cancelAppointment } = await import("./appointment.service");
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

      const { cancelAppointment } = await import("./appointment.service");
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

      const { cancelAppointment } = await import("./appointment.service");
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

      const { getAppointments } = await import("./appointment.service");
      // Asking for someone else's appointments must not widen the scope.
      await getAppointments({ patientId: "p-other" }, { userId: "u1", role: "PATIENT" });

      const where = vi.mocked(prisma.appointment.findMany).mock.calls[0]![0]!.where as any;
      expect(where.patientId).toBe("p-self");
    });

    it("does not scope a RECEPTIONIST's list query", async () => {
      vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as any);
      vi.mocked(prisma.appointment.count).mockResolvedValue(0 as any);

      const { getAppointments } = await import("./appointment.service");
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

      const { getAppointmentById } = await import("./appointment.service");
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

      const { checkInAppointment } = await import("./appointment.service");
      await expect(checkInAppointment("qr-token", "u1")).rejects.toThrow("Too early");
    });
  });
});
