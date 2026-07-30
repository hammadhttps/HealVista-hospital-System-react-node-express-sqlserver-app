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
vi.mock("../utils/audit", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./slot.service", () => ({ unlockSlotInRedis: vi.fn() }));

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
      const result = await cancelAppointment("apt-1", "Changed mind", "u1");
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
      await expect(cancelAppointment("apt-1", "reason", "u1")).rejects.toThrow("Cannot cancel");
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
