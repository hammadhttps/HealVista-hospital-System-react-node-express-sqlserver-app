import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { saveSearchSchema, searchQuerySchema } from "@healvista/shared";
import * as searchController from "../controllers/search.controller.js";

const router = Router();

/**
 * Global keyword search. One endpoint for every role — the service decides which
 * entity types and rows the caller may match, in SQL.
 */
router.get("/", authenticate, validate(searchQuerySchema, "query"), searchController.search);

router.get("/history", authenticate, searchController.history);
router.delete("/history", authenticate, searchController.clearHistory);

router.get("/saved", authenticate, searchController.listSaved);
router.post("/saved", authenticate, validate(saveSearchSchema), searchController.createSaved);
router.delete("/saved/:id", authenticate, searchController.removeSaved);

export default router;
