import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGoogleCallback } from "./oauth.service.js";
import { prisma } from "../config/db.js";
import { issueSession } from "./auth.service.js";

vi.mock("../config/db.js", () => ({
  prisma: {
    oAuthAccount: { findUnique: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../utils/audit.js", () => ({ writeAuditLog: vi.fn() }));
vi.mock("./auth.service.js", () => ({
  issueSession: vi.fn().mockResolvedValue({
    accessToken: "a",
    refreshToken: "r",
    user: { id: "u1", email: "p@example.com", role: "PATIENT" },
  }),
}));

const googleProfile = {
  providerUserId: "google-123",
  email: "Patient@Example.com",
  emailVerified: true,
  fullName: "A Patient",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.oAuthAccount.findUnique).mockResolvedValue(null as never);
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
});

/**
 * OAuth is patients-only. The button is hidden on the staff login form, but the
 * callback URL is public and directly reachable, so the rule has to hold here.
 */
describe("Google OAuth staff rejection", () => {
  const staffRoles = [
    "DOCTOR",
    "RECEPTIONIST",
    "PHARMACIST",
    "LAB_TECHNICIAN",
    "ACCOUNTANT",
    "ADMIN",
  ];

  it("refuses every staff role that already has an account with this email", async () => {
    for (const role of staffRoles) {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: "s1",
        email: "staff@hospital.com",
        role,
        isActive: true,
        deletedAt: null,
      } as never);

      await expect(handleGoogleCallback(googleProfile)).rejects.toMatchObject({
        statusCode: 403,
      });
    }
    // Crucially, no account was ever linked or created for them.
    expect(prisma.oAuthAccount.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses a staff account even when the Google identity is already linked", async () => {
    // A link created before the account was promoted to staff must not survive.
    vi.mocked(prisma.oAuthAccount.findUnique).mockResolvedValue({
      user: { id: "s1", email: "s@h.com", role: "ADMIN", isActive: true, deletedAt: null },
    } as never);

    await expect(handleGoogleCallback(googleProfile)).rejects.toMatchObject({ statusCode: 403 });
    expect(issueSession).not.toHaveBeenCalled();
  });
});

describe("Google OAuth linking", () => {
  it("rejects an unverified Google email instead of trusting it", async () => {
    // Linking by unverified email would hand over an existing patient's record.
    await expect(
      handleGoogleCallback({ ...googleProfile, emailVerified: false }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("links to an existing patient by verified email rather than creating a duplicate", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "patient@example.com",
      role: "PATIENT",
      isActive: true,
      deletedAt: null,
      emailVerifiedAt: new Date(),
    } as never);

    await handleGoogleCallback(googleProfile);

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.oAuthAccount.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1" }) }),
    );
  });

  it("matches the existing account case-insensitively", async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "new",
      email: "patient@example.com",
      role: "PATIENT",
    } as never);

    await handleGoogleCallback(googleProfile);
    // "Patient@Example.com" must find "patient@example.com".
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "patient@example.com" },
    });
  });

  it("creates a PATIENT with no password for a first-time Google sign-in", async () => {
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "new",
      email: "patient@example.com",
      role: "PATIENT",
    } as never);

    await handleGoogleCallback(googleProfile);

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "PATIENT", passwordHash: null }),
      }),
    );
  });

  it("refuses a deactivated account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "u1",
      email: "patient@example.com",
      role: "PATIENT",
      isActive: false,
      deletedAt: null,
    } as never);

    await expect(handleGoogleCallback(googleProfile)).rejects.toMatchObject({ statusCode: 403 });
  });
});
