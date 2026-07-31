import { Request, Response, NextFunction } from "express";
import * as chatService from "../services/chat.service.js";
import { sendSuccess, sendPaginated } from "../utils/apiResponse.js";

export async function getThreads(req: Request, res: Response, next: NextFunction) {
  try {
    const threads = await chatService.getThreads(req.user!.userId);
    sendSuccess(res, threads);
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const threadId = req.params.threadId as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const result = await chatService.getMessages(threadId, req.user!.userId, page, limit);
    sendPaginated(res, result.data, result.total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const threadId = req.params.threadId as string;
    const { content } = req.body;
    const message = await chatService.sendMessage(threadId, req.user!.userId, content);
    sendSuccess(res, message, 201);
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const threadId = req.params.threadId as string;
    await chatService.markThreadRead(threadId, req.user!.userId);
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
}
