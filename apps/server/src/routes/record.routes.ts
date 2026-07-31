import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import * as record from "../controllers/record.controller.js";

/**
 * Medical record routes.
 *
 * There is no `requireRole` here at all, and that is correct: who may touch a document
 * depends entirely on whose document it is. record.service resolves that through
 * access.service for every single call.
 *
 * Note the shape — records are never served as files by this API. The client asks for
 * a short-lived signed URL for one specific document, and that request is audited.
 */
const router = Router();

// Declared before "/:id/url" so a literal path can never be captured as an id.
router.get("/vault/export", authenticate, record.exportHealthVault);

router.post("/upload-signature", authenticate, record.createUploadSignature);
router.post("/", authenticate, record.registerRecord);
router.get("/patient/:patientId", authenticate, record.listRecords);
router.get("/:id/url", authenticate, record.getRecordUrl);
router.delete("/:id", authenticate, record.removeRecord);

export default router;
