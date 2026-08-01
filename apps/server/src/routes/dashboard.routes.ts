import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import * as dashboardController from "../controllers/dashboard.controller.js";

const router = Router();

/** Role-filtered KPI set — one endpoint for every role. Cached 60s in Redis. */
router.get("/", authenticate, dashboardController.getRoleDashboard);

export default router;
