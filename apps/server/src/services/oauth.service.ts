import crypto from "crypto";
import { prisma } from "../config/db.js";
import { AppError } from "../utils/AppError.js";
import { writeAuditLog } from "../utils/audit.js";
import { issueSession } from "./auth.service.js";

/**
 * Google OAuth (Phase 6.6) — **patients only**.
 *
 * Staff need a verified identity issued by the hospital, so a staff email
 * arriving through Google is rejected *here*, in the callback service. Hiding
 * the button on the staff login form is presentation, not security: the callback
 * URL is public and directly reachable.
 *
 * Linking is by **verified** email only. Google's `email_verified` is the whole
 * basis for trusting that the person at the other end owns the address; without
 * it, signing in with an unverified Google address would hand over an existing
 * patient's medical record.
 */

export interface GoogleProfileInput {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  fullName?: string;
}

/** Roles that may never authenticate through an external identity provider. */
const STAFF_ROLES = [
  "DOCTOR",
  "RECEPTIONIST",
  "PHARMACIST",
  "LAB_TECHNICIAN",
  "ACCOUNTANT",
  "ADMIN",
];

export async function handleGoogleCallback(
  profile: GoogleProfileInput,
  ipAddress?: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string };
}> {
  if (!profile.email) {
    throw new AppError("Google did not return an email address", 400);
  }
  if (!profile.emailVerified) {
    throw new AppError("Your Google email address is not verified", 403);
  }

  const email = profile.email.toLowerCase();

  // 1. Already linked — the provider id is the identity, not the email, so a
  //    Google account that later changes its address still resolves correctly.
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: {
      provider_providerUserId: { provider: "google", providerUserId: profile.providerUserId },
    },
    include: { user: true },
  });

  if (existingLink) {
    const user = existingLink.user;
    assertNotStaff(user.role);
    assertActive(user.isActive, user.deletedAt);
    await audit(user.id, "OAUTH_LOGIN", ipAddress, { provider: "google", linked: true });
    return issueSession(user, ipAddress);
  }

  // 2. An account already exists for this verified email — link to it rather
  //    than creating a duplicate patient record.
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    assertNotStaff(existingUser.role);
    assertActive(existingUser.isActive, existingUser.deletedAt);

    await prisma.oAuthAccount.create({
      data: {
        userId: existingUser.id,
        provider: "google",
        providerUserId: profile.providerUserId,
      },
    });

    // Google has verified the address, so an account that signed up by password
    // and never confirmed its email is confirmed now.
    if (!existingUser.emailVerifiedAt) {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: { emailVerifiedAt: new Date() },
      });
    }

    await audit(existingUser.id, "OAUTH_ACCOUNT_LINKED", ipAddress, { provider: "google" });
    return issueSession(existingUser, ipAddress);
  }

  // 3. Brand new patient. Created without a password — this account can only be
  //    entered through Google until the holder sets one.
  const created = await prisma.user.create({
    data: {
      email,
      role: "PATIENT",
      emailVerifiedAt: new Date(),
      passwordHash: null,
      patient: {
        create: {
          mrn: `MRN-${Date.now().toString(36).toUpperCase()}-${crypto.randomInt(1000, 9999)}`,
          fullName: profile.fullName?.trim() || email.split("@")[0],
        },
      },
      oauthAccounts: {
        create: { provider: "google", providerUserId: profile.providerUserId },
      },
    },
  });

  await audit(created.id, "OAUTH_ACCOUNT_CREATED", ipAddress, { provider: "google" });
  return issueSession(created, ipAddress);
}

function assertNotStaff(role: string): void {
  if (STAFF_ROLES.includes(role)) {
    // 403, not 401: the credentials were fine, this route is simply not open to
    // this account. The message deliberately does not confirm the role.
    throw new AppError("This account must sign in with its hospital credentials", 403);
  }
}

function assertActive(isActive: boolean, deletedAt: Date | null): void {
  if (!isActive || deletedAt) {
    throw new AppError("Account is deactivated", 403);
  }
}

async function audit(
  userId: string,
  action: string,
  ipAddress?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await writeAuditLog({
    actorUserId: userId,
    action,
    targetType: "User",
    targetId: userId,
    ipAddress,
    metadata,
  });
}
