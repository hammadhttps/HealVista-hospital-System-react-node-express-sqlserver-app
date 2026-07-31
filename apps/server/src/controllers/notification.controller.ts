import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/db";
import { sendSuccess, sendPaginated } from "../utils/apiResponse";

export async function listMyNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const unreadOnly = req.query.unreadOnly === "true";

    const where: Record<string, unknown> = { userId };
    if (unreadOnly) where.isRead = false;

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    sendPaginated(res, data, total, page, limit);
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    sendSuccess(res, { count });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const { ids } = req.body;

    if (ids && Array.isArray(ids)) {
      await prisma.notification.updateMany({
        where: { id: { in: ids as string[] }, userId },
        data: { isRead: true },
      });
    } else {
      await prisma.notification.updateMany({
        where: { id: req.params.id as string, userId },
        data: { isRead: true },
      });
    }

    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    sendSuccess(res, { success: true });
  } catch (err) {
    next(err);
  }
}

export async function getPreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId },
    });
    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { userId },
      });
    }
    sendSuccess(res, prefs);
  } catch (err) {
    next(err);
  }
}

export async function updatePreferences(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const prefs = await prisma.notificationPreference.upsert({
      where: { userId },
      update: req.body,
      create: { userId, ...req.body },
    });
    sendSuccess(res, prefs);
  } catch (err) {
    next(err);
  }
}
