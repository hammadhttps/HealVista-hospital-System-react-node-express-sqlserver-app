import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { updateNotificationPreferenceSchema, markReadSchema } from "@medicore/shared";
import * as notificationController from "../controllers/notification.controller.js";

const router = Router();

router.get("/", authenticate, notificationController.listMyNotifications);
router.get("/unread-count", authenticate, notificationController.getUnreadCount);
router.patch("/:id/read", authenticate, notificationController.markRead);
router.patch("/read-all", authenticate, notificationController.markAllRead);
router.patch("/read", authenticate, validate(markReadSchema), notificationController.markRead);

router.get("/preferences", authenticate, notificationController.getPreferences);
router.put(
  "/preferences",
  authenticate,
  validate(updateNotificationPreferenceSchema),
  notificationController.updatePreferences,
);

export default router;
