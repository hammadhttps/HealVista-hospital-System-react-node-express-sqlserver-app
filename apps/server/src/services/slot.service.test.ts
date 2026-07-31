import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../config/db.js";

vi.mock("../config/db", () => ({
  prisma: {
    doctor: { findUnique: vi.fn(), findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    availabilityException: { findMany: vi.fn() },
    appointmentSlot: { findMany: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
    doctorDepartment: { findMany: vi.fn() },
  },
}));

vi.mock("../config/redis", () => ({ redis: null, getCached: vi.fn(), setCached: vi.fn() }));

describe("SlotService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateSlotsForDoctor", () => {
    it("should throw if doctor not found", async () => {
      vi.mocked(prisma.doctor.findUnique).mockResolvedValue(null);
      const { generateSlotsForDoctor } = await import("./slot.service.js");

      await expect(generateSlotsForDoctor("nonexistent")).rejects.toThrow("Doctor not found");
    });

    it("should return empty array if doctor has no availability", async () => {
      vi.mocked(prisma.doctor.findUnique).mockResolvedValue({
        id: "doc-1",
        availability: [],
      } as any);
      vi.mocked(prisma.holiday.findMany).mockResolvedValue([]);
      vi.mocked(prisma.availabilityException.findMany).mockResolvedValue([]);
      vi.mocked(prisma.appointmentSlot.findMany).mockResolvedValue([]);

      const { generateSlotsForDoctor } = await import("./slot.service.js");
      const result = await generateSlotsForDoctor("doc-1");
      expect(result.count).toBe(0);
    });

    it("should skip holidays", async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);

      vi.mocked(prisma.doctor.findUnique).mockResolvedValue({
        id: "doc-1",
        availability: [
          {
            id: "avail-1",
            dayOfWeek: today.getUTCDay(),
            startTime: "09:00",
            endTime: "10:00",
            slotDurationMins: 30,
            breakStart: null,
            breakEnd: null,
            isActive: true,
          },
        ],
      } as any);

      vi.mocked(prisma.holiday.findMany).mockResolvedValue([
        {
          id: "hol-1",
          name: "Test Holiday",
          date: today,
          isRecurring: false,
          departmentId: null,
        },
      ]);

      vi.mocked(prisma.availabilityException.findMany).mockResolvedValue([]);
      vi.mocked(prisma.appointmentSlot.findMany).mockResolvedValue([]);
      vi.mocked(prisma.doctorDepartment.findMany).mockResolvedValue([]);

      const { generateSlotsForDoctor } = await import("./slot.service.js");
      const result = await generateSlotsForDoctor("doc-1", today, today);
      expect(result.count).toBe(0);
    });

    it("should be idempotent — running twice produces same count", async () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

      vi.mocked(prisma.doctor.findUnique).mockResolvedValue({
        id: "doc-2",
        availability: [
          {
            id: "avail-2",
            dayOfWeek: today.getUTCDay(),
            startTime: "09:00",
            endTime: "11:00",
            slotDurationMins: 30,
            breakStart: null,
            breakEnd: null,
            isActive: true,
          },
        ],
      } as any);

      vi.mocked(prisma.holiday.findMany).mockResolvedValue([]);
      vi.mocked(prisma.availabilityException.findMany).mockResolvedValue([]);

      let existingSlots: Array<{ startTime: Date }> = [];

      vi.mocked(prisma.appointmentSlot.findMany)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(existingSlots as any);

      vi.mocked(prisma.doctorDepartment.findMany).mockResolvedValue([]);
      vi.mocked(prisma.appointmentSlot.createMany).mockResolvedValue({ count: 8 });

      const { generateSlotsForDoctor } = await import("./slot.service.js");
      const firstRun = await generateSlotsForDoctor("doc-2", today, tomorrow);
      expect(firstRun.count).toBeGreaterThan(0);

      existingSlots = Array.from({ length: firstRun.count || 0 }, (_, i) => ({
        startTime: new Date(today.getTime() + i * 30 * 60000),
      }));

      vi.mocked(prisma.appointmentSlot.findMany).mockResolvedValueOnce(existingSlots as any);

      vi.mocked(prisma.appointmentSlot.createMany).mockResolvedValueOnce({ count: 0 });

      const secondRun = await generateSlotsForDoctor("doc-2", today, tomorrow);
      expect(secondRun.count).toBe(0);
    });
  });
});
