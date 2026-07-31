import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import * as settingsController from "../controllers/settings.controller.js";

const router = Router();

router.get("/", authenticate, settingsController.get);
router.put("/", authenticate, requireRole("ADMIN"), settingsController.update);

export default router;
