vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.DIRECT_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
  delete process.env.REDIS_URL;
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db.js";
import * as authService from "./auth.service.js";

vi.mock("../config/db", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    userSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    passwordHistory: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    loginAttempt: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
  },
  sign: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authService.register", () => {
  const input = {
    email: "new@patient.com",
    password: "Str0ng!Pass",
    role: "PATIENT" as const,
    fullName: "Test Patient",
  };

  it("registers a new patient", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed-password" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-1",
      email: input.email,
      role: "PATIENT",
      patient: { id: "patient-1" },
    } as any);
    vi.mocked(prisma.passwordHistory.create).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const result = await authService.register(input);

    expect(result.user.email).toBe(input.email);
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

    await expect(authService.register(input)).rejects.toMatchObject({
      statusCode: 409,
      message: "Email already registered",
    });
  });
});

describe("authService.login", () => {
  const input = { email: "test@test.com", password: "password123" };
  const mockUser = {
    id: "user-1",
    email: "test@test.com",
    role: "DOCTOR",
    isActive: true,
    passwordHash: "hashed-password",
    lockedUntil: null,
    failedLoginCount: 0,
  };

  it("logs in with valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.userSession.create).mockResolvedValue({ id: "session-1" } as any);
    vi.mocked(jwt.sign).mockReturnValue("access-token" as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const result = await authService.login(input);

    expect(result.accessToken).toBe("access-token");
    expect(result.user.email).toBe(input.email);
  });

  it("rejects wrong password and increments lockout", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      failedLoginCount: 4,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 401,
    });

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginCount: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it("rejects login when account is locked", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      lockedUntil: new Date(Date.now() + 10000),
    } as any);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 423,
      message: expect.stringContaining("locked"),
    });
  });

  it("rejects login when account is deactivated", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...mockUser,
      isActive: false,
    } as any);

    await expect(authService.login(input)).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("deactivated"),
    });
  });
});

describe("authService.refresh", () => {
  const refreshTokenStr = "valid-refresh-token";

  it("rotates a valid refresh token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      sessionId: "session-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      isActive: true,
      role: "DOCTOR",
    } as any);
    vi.mocked(jwt.sign).mockReturnValue("new-access-token" as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const result = await authService.refresh(refreshTokenStr);

    expect(result.accessToken).toBe("new-access-token");
    expect(prisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rt-1" },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("rejects a revoked refresh token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
    } as any);

    await expect(authService.refresh(refreshTokenStr)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("rejects a deactivated user's refresh token", async () => {
    vi.mocked(prisma.refreshToken.findUnique).mockResolvedValue({
      id: "rt-1",
      userId: "user-1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000),
    } as any);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      isActive: false,
    } as any);

    await expect(authService.refresh(refreshTokenStr)).rejects.toMatchObject({
      statusCode: 401,
    });
  });
});

describe("authService.revokeSession", () => {
  it("revokes own session", async () => {
    vi.mocked(prisma.userSession.findUnique).mockResolvedValue({
      id: "session-1",
      userId: "user-1",
    } as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);

    await authService.revokeSession("user-1", "session-1");

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("refuses to revoke another user's session", async () => {
    vi.mocked(prisma.userSession.findUnique).mockResolvedValue({
      id: "session-2",
      userId: "user-2",
    } as any);

    await expect(authService.revokeSession("user-1", "session-2")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
