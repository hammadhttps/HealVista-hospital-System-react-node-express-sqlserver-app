import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";
import passport, { isGoogleOAuthConfigured } from "../config/passport.js";
import { env } from "../config/env.js";
import * as authController from "../controllers/auth.controller.js";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerifySchema,
  changePasswordSchema,
  changeEmailSchema,
  changePhoneSchema,
  updateProfileSchema,
} from "@healvista/shared";

const router = Router();

router.post(
  "/register",
  rateLimit(20, 60 * 60 * 1000, "register"),
  validate(registerSchema),
  authController.register,
);
router.post(
  "/login",
  rateLimit(env.LOGIN_RATE_LIMIT_MAX, 15 * 60 * 1000, "login"),
  validate(loginSchema),
  authController.login,
);
router.post("/refresh", authController.refresh);
router.post("/verify-email", validate(verifyEmailSchema), authController.verifyEmail);
router.post("/resend-verify", validate(resendVerifySchema), authController.resendVerification);

/**
 * Google OAuth — patients only, enforced in the callback service.
 *
 * Registered only when Google credentials are configured, so a deployment
 * without them 404s here rather than failing inside passport.
 */
if (isGoogleOAuthConfigured) {
  router.get(
    "/google",
    rateLimit(20, 15 * 60 * 1000, "oauth"),
    passport.authenticate("google", { session: false, scope: ["profile", "email"] }),
  );

  router.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      // Absolute, not relative: a relative redirect would land on the server's
      // own /login (a 404 on this API) instead of the SPA's sign-in page.
      failureRedirect: `${env.CLIENT_URL}/login?error=oauth`,
    }),
    authController.googleCallback,
  );
}

router.use(authenticate);
router.post("/logout", authController.logout);
router.post("/logout-all", authController.logoutAll);
router.get("/me", authController.getMe);
router.post("/change-password", validate(changePasswordSchema), authController.changePassword);
router.post("/change-email", validate(changeEmailSchema), authController.changeEmail);
router.post("/change-phone", validate(changePhoneSchema), authController.changePhone);
router.patch("/profile", validate(updateProfileSchema), authController.updateProfile);
router.get("/sessions", authController.getSessions);
router.delete("/sessions/:id", authController.revokeSession);

export default router;
