import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.CLIENT_URL = "http://localhost:5173";
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.DIRECT_URL = "postgresql://test:test@localhost:5432/test";
  process.env.JWT_ACCESS_SECRET = "a".repeat(32);
  process.env.JWT_REFRESH_SECRET = "b".repeat(32);
});

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
      findMany: vi.fn(),
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
    },
    loginAttempt: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("bcryptjs", () => ({
  default: { hash: vi.fn(), compare: vi.fn() },
  hash: vi.fn(),
  compare: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: { sign: vi.fn() },
  sign: vi.fn(),
}));

import { prisma } from "../config/db.js";
import bcrypt from "bcryptjs";
import app from "../app.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/register", () => {
  it("registers a new user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(bcrypt.hash).mockResolvedValue("hashed" as never);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      role: "PATIENT",
      patient: { id: "patient-1" },
    } as any);
    vi.mocked(prisma.passwordHistory.create).mockResolvedValue({} as any);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "test@test.com", password: "Str0ng!Pass", fullName: "Test User" });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("rejects duplicate email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as any);

    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "existing@test.com", password: "Str0ng!Pass", fullName: "Test" });

    expect(res.status).toBe(409);
  });

  it("rejects invalid input", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "not-an-email", password: "short" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      role: "PATIENT",
      isActive: true,
      passwordHash: "hashed-pw",
      lockedUntil: null,
      failedLoginCount: 0,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
    vi.mocked(prisma.userSession.create).mockResolvedValue({ id: "session-1" } as any);
    vi.mocked(jwt.sign).mockReturnValue("access-token" as never);
    vi.mocked(prisma.refreshToken.create).mockResolvedValue({} as any);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe("access-token");
  });

  it("rejects wrong password and increments lockout", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      role: "PATIENT",
      isActive: true,
      passwordHash: "hashed-pw",
      lockedUntil: null,
      failedLoginCount: 4,
    } as any);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "wrong" });

    expect(res.status).toBe(401);
  });

  it("rejects login when account is locked", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      isActive: true,
      lockedUntil: new Date(Date.now() + 10000),
    } as any);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "test@test.com", password: "password123" });

    expect(res.status).toBe(423);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rejects request without refresh token", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Refresh token required");
  });
});
