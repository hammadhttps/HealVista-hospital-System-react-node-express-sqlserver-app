import { Router } from "express";
import { validate } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { createDirectChatThreadSchema, sendMessageSchema } from "@healvista/shared";
import * as chatController from "../controllers/chat.controller.js";

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
router.post(
  "/threads",
  authenticate,
  validate(createDirectChatThreadSchema),
  chatController.createThread,
);

export default router;
