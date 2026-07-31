import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../config/db.js";
import * as patientService from "./patient.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    patient: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    emergencyContact: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    // Guardian links — ownership checks ask "is this the patient *or* an authorised
    // guardian?".
    patientRelationship: { findMany: vi.fn() },
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn() },
  hash: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("patientService.registerPatient", () => {
  const input = {
    email: "patient@test.com",
    password: "Str0ng!Pass",
    fullName: "John Doe",
    phone: "+1234567890",
  };

  it("registers a new patient", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed-pw" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-1",
      email: input.email,
      role: "PATIENT",
      patient: { id: "patient-1", fullName: input.fullName, mrn: "MRN-TEST-1234" },
    } as any);

    const result = await patientService.registerPatient(input);

    expect(result.email).toBe(input.email);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: input.email,
          role: "PATIENT",
        }),
      }),
    );
  });

  it("rejects a duplicate email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as any);

    await expect(patientService.registerPatient(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already registered",
    });
  });
});

describe("patientService.listPatients", () => {
  it("returns paginated patients", async () => {
    vi.mocked(prisma.patient.findMany).mockResolvedValue([
      { id: "p-1", fullName: "John Doe" },
    ] as any);
    vi.mocked(prisma.patient.count).mockResolvedValue(1);

    const result = await patientService.listPatients({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
  });

  it("respects search filter", async () => {
    vi.mocked(prisma.patient.findMany).mockResolvedValue([] as any);
    vi.mocked(prisma.patient.count).mockResolvedValue(0);

    await patientService.listPatients({ search: "John", page: 1, limit: 10 });

    expect(prisma.patient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([expect.objectContaining({ fullName: expect.any(Object) })]),
        }),
      }),
    );
  });
});

describe("patientService.getPatientById", () => {
  it("returns a patient when found", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({
      id: "p-1",
      fullName: "John Doe",
      deletedAt: null,
      user: { id: "u-1", email: "john@test.com" },
      emergencyContacts: [],
    } as any);

    const result = await patientService.getPatientById("p-1");

    expect(result.id).toBe("p-1");
  });

  it("throws 404 when patient is not found", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue(null);

    await expect(patientService.getPatientById("p-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it("throws 404 when patient is soft-deleted", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({
      id: "p-1",
      deletedAt: new Date(),
    } as any);

    await expect(patientService.getPatientById("p-1")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe("patientService.removeEmergencyContact", () => {
  const receptionist = { userId: "u-recep", role: "RECEPTIONIST" };

  it("removes an existing contact", async () => {
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue({
      id: "ec-1",
      patientId: "p-1",
    } as any);

    await patientService.removeEmergencyContact("p-1", "ec-1", receptionist);

    expect(prisma.emergencyContact.delete).toHaveBeenCalledWith({
      where: { id: "ec-1" },
    });
  });

  it("throws 404 when contact is not found", async () => {
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue(null);

    await expect(
      patientService.removeEmergencyContact("p-1", "ec-1", receptionist),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("refuses a patient deleting someone else's emergency contact", async () => {
    // These routes carry `authenticate` and nothing else, so this check is the only
    // thing standing between any logged-in user and a stranger's next-of-kin details.
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-attacker" } as any);
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([] as never);

    await expect(
      patientService.removeEmergencyContact("p-1", "ec-1", {
        userId: "u-attacker",
        role: "PATIENT",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });

    expect(prisma.emergencyContact.delete).not.toHaveBeenCalled();
  });

  it("allows a guardian to manage their dependant's emergency contacts", async () => {
    vi.mocked(prisma.patient.findUnique).mockResolvedValue({ id: "p-parent" } as any);
    vi.mocked(prisma.patientRelationship.findMany).mockResolvedValue([
      { dependentPatientId: "p-1" },
    ] as never);
    vi.mocked(prisma.emergencyContact.findFirst).mockResolvedValue({
      id: "ec-1",
      patientId: "p-1",
    } as any);

    await patientService.removeEmergencyContact("p-1", "ec-1", {
      userId: "u-parent",
      role: "PATIENT",
    });

    expect(prisma.emergencyContact.delete).toHaveBeenCalledWith({ where: { id: "ec-1" } });
  });
});
