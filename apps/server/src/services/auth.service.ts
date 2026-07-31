import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import type { RegisterInput, LoginInput } from "@healvista/shared";

const BCRYPT_ROUNDS = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const PASSWORD_HISTORY_COUNT = 5;

function signAccessToken(userId: string, role: string, sessionId: string): string {
  return jwt.sign({ userId, role, sessionId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);
}

function signRefreshToken(): string {
  return crypto.randomBytes(64).toString("hex");
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new AppError("Email already registered", 409);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
      patient:
        input.role === "PATIENT"
          ? {
              create: {
                mrn: `MRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`,
                fullName: input.fullName,
              },
            }
          : undefined,
    },
    include: { patient: input.role === "PATIENT" },
  });

  // Create password history entry
  await prisma.passwordHistory.create({
    data: { userId: user.id, passwordHash },
  });

  // Create email verification token
  const emailToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(emailToken);
  // Store in refresh_tokens table as a simple mechanism
  // In production, use a dedicated email_verifications table
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    },
  });

  return {
    user: { id: user.id, email: user.email, role: user.role },
    emailToken,
  };
}

export async function login(input: LoginInput, ipAddress?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  if (!user.isActive) {
    throw new AppError("Account is deactivated", 403);
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError("Account is locked. Try again later.", 423);
  }

  if (!user.passwordHash) {
    throw new AppError("Invalid email or password", 401);
  }

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) {
    // Record failed attempt
    const newCount = user.failedLoginCount + 1;
    const updateData: any = { failedLoginCount: newCount };

    if (newCount >= LOCKOUT_THRESHOLD) {
      updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
    }

    await prisma.user.update({ where: { id: user.id }, data: updateData });

    await prisma.loginAttempt.create({
      data: {
        email: input.email,
        ipAddress,
        successful: false,
        reason: "wrong_password",
      },
    });

    throw new AppError("Invalid email or password", 401);
  }

  // Successful login — reset lockout
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  await prisma.loginAttempt.create({
    data: { email: input.email, ipAddress, successful: true },
  });

  // Create session
  const session = await prisma.userSession.create({
    data: { userId: user.id, ipAddress, lastActiveAt: new Date() },
  });

  // Generate tokens
  const accessToken = signAccessToken(user.id, user.role, session.id);
  const refreshToken = signRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function refresh(refreshTokenStr: string) {
  const tokenHash = hashToken(refreshTokenStr);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  // Rotate: revoke old, issue new
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive) {
    throw new AppError("Account not found or deactivated", 401);
  }

  const newRefreshToken = signRefreshToken();
  const newAccessToken = signAccessToken(user.id, user.role, stored.sessionId ?? "");

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      sessionId: stored.sessionId,
      tokenHash: hashToken(newRefreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: { id: user.id, email: user.email, role: user.role },
  };
}

export async function logout(userId: string, sessionId: string) {
  await prisma.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.userSession.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string) {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patient: true,
      doctor: true,
      receptionist: true,
      pharmacist: true,
      labTechnician: true,
      accountant: true,
    },
  });
  if (!user) throw new AppError("User not found", 404);
  return user;
}

export async function verifyEmail(token: string) {
  const tokenHash = hashToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired verification token", 400);
  }

  await prisma.user.update({
    where: { id: stored.userId },
    data: { emailVerifiedAt: new Date() },
  });

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new AppError("Cannot change password for this account", 400);
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    throw new AppError("Current password is incorrect", 401);
  }

  // Check password history (last 5)
  const history = await prisma.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: PASSWORD_HISTORY_COUNT,
  });

  for (const entry of history) {
    const match = await bcrypt.compare(newPassword, entry.passwordHash);
    if (match) {
      throw new AppError("Cannot reuse a recent password", 400);
    }
  }

  const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    prisma.passwordHistory.create({ data: { userId, passwordHash: newHash } }),
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    }),
  ]);

  await writeAuditLog({
    actorUserId: userId,
    action: "PASSWORD_CHANGED",
    targetType: "User",
    targetId: userId,
  });
}

export async function resendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError("User not found", 404);
  if (user.emailVerifiedAt) throw new AppError("Email already verified", 400);

  const emailToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(emailToken);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return { emailToken };
}

export async function changeEmail(userId: string, newEmail: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new AppError("Cannot change email for this account", 400);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Password is incorrect", 401);
  }

  const existing = await prisma.user.findUnique({ where: { email: newEmail } });
  if (existing) {
    throw new AppError("Email already in use", 409);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { email: newEmail, emailVerifiedAt: null },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "EMAIL_CHANGED",
    targetType: "User",
    targetId: userId,
  });
}

export async function changePhone(userId: string, newPhone: string, password: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.passwordHash) {
    throw new AppError("Cannot change phone for this account", 400);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError("Password is incorrect", 401);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { phone: newPhone },
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "PHONE_CHANGED",
    targetType: "User",
    targetId: userId,
  });
}

export async function updateProfile(
  userId: string,
  data: { fullName?: string; phone?: string; avatarUrl?: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("User not found", 404);

  return prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, role: true, phone: true, avatarUrl: true },
  });
}

export async function getSessions(userId: string) {
  return prisma.userSession.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastActiveAt: "desc" },
  });
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.userId !== userId) {
    throw new AppError("Session not found", 404);
  }

  await prisma.$transaction([
    prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
