import { Server as HttpServer } from "http";
import { Server, Socket, Namespace } from "socket.io";
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

/**
 * Handshake authentication.
 *
 * This must be registered on **every namespace**. `io.use()` applies only to the
 * default namespace `/` — a connection to `/appointments` skips it entirely, which
 * left `socket.data.user` undefined and crashed the process on first connect.
 */
function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) {
    next(new Error("Authentication required"));
    return;
  }
  try {
    const payload = jwt.verify(token as string, env.JWT_ACCESS_SECRET) as JwtPayload;
    socket.data.user = payload;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
}

/**
 * Reads the authenticated user, or disconnects.
 *
 * Belt and braces: middleware should guarantee this, but an unhandled throw inside a
 * socket handler takes down the whole Node process. A misconfigured namespace must
 * degrade to a dropped connection, never an outage.
 */
function requireUser(socket: Socket, namespace: string): JwtPayload | null {
  const user = socket.data.user as JwtPayload | undefined;
  if (!user?.userId) {
    logger.error({ namespace, socketId: socket.id }, "Socket reached handler unauthenticated");
    socket.disconnect(true);
    return null;
  }
  return user;
}

/**
 * Wraps an async socket handler so a rejected promise is logged instead of
 * surfacing as an unhandled rejection that kills the process.
 */
function safeHandler<T>(namespace: string, event: string, fn: (payload: T) => Promise<void>) {
  return (payload: T) => {
    void fn(payload).catch((err) => {
      logger.error({ namespace, event, err }, "Socket handler failed");
    });
  };
}

export function setupSocketIO(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  const appointmentNamespace = io.of("/appointments");
  const notificationNamespace = io.of("/notifications");
  const chatNamespace = io.of("/chat");

  // Every namespace, including the default one.
  for (const ns of [
    io as unknown as Namespace,
    appointmentNamespace,
    notificationNamespace,
    chatNamespace,
  ]) {
    ns.use(authenticateSocket);
  }

  // ─── /appointments ────────────────────────────────────────────────
  appointmentNamespace.on("connection", (socket: Socket) => {
    const user = requireUser(socket, "/appointments");
    if (!user) return;

    logger.info({ userId: user.userId }, "Socket connected to /appointments");

    socket.on(
      "slot:lock",
      safeHandler("/appointments", "slot:lock", async ({ slotId }: { slotId: string }) => {
        if (!redis || !slotId) return;
        const key = `slot:${slotId}`;
        const result = await redis.set(key, user.userId, "PX", 300000, "NX");
        if (result === "OK") {
          const until = Date.now() + 300000;
          socket.emit("slot:locked", { slotId, until });
          socket.broadcast.emit("slot:locked", { slotId, until });
        } else {
          socket.emit("slot:unavailable", { slotId });
        }
      }),
    );

    socket.on(
      "slot:release",
      safeHandler("/appointments", "slot:release", async ({ slotId }: { slotId: string }) => {
        if (!redis || !slotId) return;
        // Only the holder may release the lock, or one patient could free another's
        // slot mid-checkout.
        const holder = await redis.get(`slot:${slotId}`);
        if (holder !== user.userId) return;
        await redis.del(`slot:${slotId}`);
        socket.broadcast.emit("slot:released", { slotId });
      }),
    );

    socket.on(
      "join:appointment",
      safeHandler(
        "/appointments",
        "join:appointment",
        async ({ appointmentId }: { appointmentId: string }) => {
          if (!appointmentId) return;
          const { prisma } = await import("../config/db.js");
          const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            select: {
              patient: { select: { userId: true } },
              doctor: { select: { userId: true } },
            },
          });
          // Room names are guessable — participation decides, not knowledge of the id.
          if (
            appointment &&
            (appointment.patient.userId === user.userId ||
              appointment.doctor.userId === user.userId)
          ) {
            socket.join(`appointment:${appointmentId}`);
          }
        },
      ),
    );

    // `doctor:{id}` carries slot lock/release events only — availability, no patient
    // data — so any authenticated user booking with that doctor may listen.
    socket.on("join:doctor", ({ doctorId }: { doctorId: string }) => {
      if (typeof doctorId === "string" && doctorId) socket.join(`doctor:${doctorId}`);
    });

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /appointments");
    });
  });

  // ─── /notifications ───────────────────────────────────────────────
  notificationNamespace.on("connection", (socket: Socket) => {
    const user = requireUser(socket, "/notifications");
    if (!user) return;

    // Own room only — never a room derived from client input.
    socket.join(`user:${user.userId}`);
    logger.info({ userId: user.userId }, "Socket connected to /notifications");

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /notifications");
    });
  });

  // ─── /chat ────────────────────────────────────────────────────────
  chatNamespace.on("connection", (socket: Socket) => {
    const user = requireUser(socket, "/chat");
    if (!user) return;

    logger.info({ userId: user.userId }, "Socket connected to /chat");

    socket.on(
      "chat:join",
      safeHandler("/chat", "chat:join", async ({ threadId }: { threadId: string }) => {
        if (!threadId) return;
        // Without this check any authenticated user could join any thread by id and
        // receive another patient's conversation.
        const { isThreadParticipant } = await import("../services/chat.service.js");
        if (!(await isThreadParticipant(threadId, user.userId))) {
          socket.emit("chat:forbidden", { threadId });
          return;
        }
        socket.join(`chat:${threadId}`);
      }),
    );

    // Typing indicators only reach rooms this socket has already been authorised into.
    socket.on("chat:typing", ({ threadId }: { threadId: string }) => {
      if (!socket.rooms.has(`chat:${threadId}`)) return;
      socket.to(`chat:${threadId}`).emit("chat:typing", { threadId, userId: user.userId });
    });

    socket.on("chat:stop_typing", ({ threadId }: { threadId: string }) => {
      if (!socket.rooms.has(`chat:${threadId}`)) return;
      socket.to(`chat:${threadId}`).emit("chat:stop_typing", { threadId, userId: user.userId });
    });

    socket.on("disconnect", () => {
      logger.info({ userId: user.userId }, "Socket disconnected from /chat");
    });
  });

  logger.info("Socket.io initialized");
  return io;
}
