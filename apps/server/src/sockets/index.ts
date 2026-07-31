import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { allowedOrigins } from "../config/cors.js";
import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import type { JwtPayload } from "../middlewares/auth.middleware.js";

let io: Server | null = null;

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function setupSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (!token) {
      next(new Error("Authentication required"));
      return;
    }
    try {
      const payload = jwt.verify(token as string, env.JWT_ACCESS_SECRET) as JwtPayload;
      (socket as any).data.user = payload;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  const appointmentNamespace = io.of("/appointments");
  const notificationNamespace = io.of("/notifications");

  appointmentNamespace.on("connection", (socket: Socket) => {
    const user = (socket as any).data.user as JwtPayload;
    logger.info({ userId: user.userId }, "Socket connected to /appointments");

    socket.on("slot:lock", async ({ slotId }: { slotId: string }) => {
      if (!redis) return;
      const key = `slot:${slotId}`;
      const result = await redis.set(key, user.userId, "PX", 300000, "NX");
      if (result === "OK") {
        socket.emit("slot:locked", { slotId, until: Date.now() + 300000 });
        socket.broadcast.emit("slot:locked", { slotId, until: Date.now() + 300000 });
      } else {
        socket.emit("slot:unavailable", { slotId });
      }
    });

    socket.on("slot:release", async ({ slotId }: { slotId: string }) => {
      if (!redis) return;
      await redis.del(`slot:${slotId}`);
      socket.broadcast.emit("slot:released", { slotId });
    });

    socket.on("join:appointment", async ({ appointmentId }: { appointmentId: string }) => {
      try {
        const { prisma } = await import("../config/db.js");
        const appointment = await prisma.appointment.findUnique({
          where: { id: appointmentId },
          select: { patient: { select: { userId: true } }, doctor: { select: { userId: true } } },
        });
        if (
          appointment &&
          (appointment.patient.userId === user.userId || appointment.doctor.userId === user.userId)
        ) {
          socket.join(`appointment:${appointmentId}`);
        }
      } catch {
        // silent
      }
    });

    socket.on("join:doctor", ({ doctorId }: { doctorId: string }) => {
      socket.join(`doctor:${doctorId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /appointments");
    });
  });

  notificationNamespace.on("connection", (socket: Socket) => {
    const user = (socket as any).data.user as JwtPayload;
    socket.join(`user:${user.userId}`);
    logger.info({ userId: user.userId }, "Socket connected to /notifications");

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /notifications");
    });
  });

  const chatNamespace = io.of("/chat");

  chatNamespace.on("connection", (socket: Socket) => {
    const user = (socket as any).data.user as JwtPayload;
    logger.info({ userId: user.userId }, "Socket connected to /chat");

    socket.on("chat:join", ({ threadId }: { threadId: string }) => {
      socket.join(`chat:${threadId}`);
    });

    socket.on("chat:typing", ({ threadId }: { threadId: string }) => {
      socket.to(`chat:${threadId}`).emit("chat:typing", { threadId, userId: user.userId });
    });

    socket.on("chat:stop_typing", ({ threadId }: { threadId: string }) => {
      socket.to(`chat:${threadId}`).emit("chat:stop_typing", { threadId, userId: user.userId });
    });

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /chat");
    });
  });

  logger.info("Socket.io initialized");
  return io;
}
