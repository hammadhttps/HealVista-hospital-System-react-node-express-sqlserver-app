import { Router } from "express";
import { validate } from "../middlewares/validate.middleware";
import { authenticate } from "../middlewares/auth.middleware";
import { sendMessageSchema } from "@medicore/shared";
import * as chatController from "../controllers/chat.controller";

const router = Router();

router.get("/threads", authenticate, chatController.getThreads);
router.get("/threads/:threadId/messages", authenticate, chatController.getMessages);
router.post(
  "/threads/:threadId/messages",
  authenticate,
  validate(sendMessageSchema),
  chatController.sendMessage,
);
router.patch("/threads/:threadId/read", authenticate, chatController.markRead);

export default router;
