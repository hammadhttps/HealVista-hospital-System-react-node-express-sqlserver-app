import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { rateLimit } from "../middlewares/rateLimit.middleware.js";
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
  rateLimit(20, 60 * 60 * 1000),
  validate(registerSchema),
  authController.register,
);
router.post("/login", rateLimit(10, 15 * 60 * 1000), validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);
router.post("/verify-email", validate(verifyEmailSchema), authController.verifyEmail);
router.post("/resend-verify", validate(resendVerifySchema), authController.resendVerification);

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
