import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { allowedOrigins } from "./config/cors.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { logger } from "./utils/logger.js";
import authRoutes from "./routes/auth.routes.js";
import departmentRoutes from "./routes/department.routes.js";
import settingsRoutes from "./routes/settings.routes.js";
import holidayRoutes from "./routes/holiday.routes.js";
import patientRoutes from "./routes/patient.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import appointmentRoutes from "./routes/appointment.routes.js";
import queueRoutes from "./routes/queue.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import chatRoutes from "./routes/chat.routes.js";

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Security
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Correlation id
app.use((req, _res, next) => {
  req.correlationId = (req.headers["x-correlation-id"] as string) || crypto.randomUUID();
  next();
});

// Request logging
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, correlationId: req.correlationId }, "request");
  next();
});

// Swagger
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MediCore API",
      version: "1.0.0",
      description: "HealVista Hospital Management System",
    },
  },
  apis: ["./src/routes/*.ts"],
});
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check
app.get("/api/health", async (_req, res) => {
  const { prisma } = await import("./config/db.js");
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "ok", uptime: process.uptime() });
  } catch {
    res.status(503).json({ status: "error", db: "error", uptime: process.uptime() });
  }
});

// ─── Routes ────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/holidays", holidayRoutes);
app.use("/api/patients", patientRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);

// ─── Error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

export default app;
