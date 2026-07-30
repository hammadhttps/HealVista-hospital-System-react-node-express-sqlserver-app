import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { requireRole } from "../middlewares/rbac.middleware";
import * as settingsController from "../controllers/settings.controller";

const router = Router();

router.get("/", authenticate, settingsController.get);
router.put("/", authenticate, requireRole("ADMIN"), settingsController.update);

export default router;
