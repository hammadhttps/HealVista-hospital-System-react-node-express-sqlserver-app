import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { uploadSignatureSchema, registerRecordSchema } from "@healvista/shared";
import * as record from "../controllers/record.controller.js";

/**
 * Medical record routes.
 *
 * There is almost no `requireRole` here, and that is correct: who may touch a
 * document depends entirely on whose document it is. record.service resolves that
 * through access.service for every single call. The one exception is `/mine`, which
 * is inherently patient-only.
 *
 * Note the shape — records are never served as files by this API. The client asks for
 * a short-lived signed URL for one specific document, and that request is audited.
 * The sole streaming response is the health-vault export PDF.
 */
const router = Router();

// Literal paths are declared before the parameterised ones so a word like "mine" can
// never be captured as a record id.
router.get("/vault/export", authenticate, record.exportHealthVault);
router.get("/mine", authenticate, requireRole("PATIENT"), record.listMyRecords);

router.post(
  "/upload-signature",
  authenticate,
  validate(uploadSignatureSchema),
  record.createUploadSignature,
);
router.post("/", authenticate, validate(registerRecordSchema), record.registerRecord);
router.get("/patient/:patientId", authenticate, record.listRecords);
router.get("/:id/url", authenticate, record.getRecordUrl);
router.delete("/:id", authenticate, record.removeRecord);

export default router;
