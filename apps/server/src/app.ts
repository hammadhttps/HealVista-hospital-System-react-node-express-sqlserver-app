import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { isOriginAllowed } from "./config/cors.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { rateLimit } from "./middlewares/rateLimit.middleware.js";
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
import clinicalRoutes from "./routes/clinical.routes.js";
import labRoutes from "./routes/lab.routes.js";
import pharmacyRoutes from "./routes/pharmacy.routes.js";
import recordRoutes from "./routes/record.routes.js";
import aiRoutes from "./routes/ai.routes.js";
import billingRoutes, { discountRouter, insuranceRouter } from "./routes/billing.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import analyticsRoutes from "./routes/analytics.routes.js";
import searchRoutes from "./routes/search.routes.js";
import { adminComplianceRouter, meComplianceRouter } from "./routes/compliance.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import * as paymentController from "./controllers/payment.controller.js";

const app = express();

// Trust proxy (for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Security
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Swagger UI is served from this same origin and injects inline styles;
        // JSON APIs need no remote sources at all.
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

// ─── Payment webhooks ──────────────────────────────────────────────
// These MUST be mounted before express.json(). Signature verification hashes the
// exact bytes the provider sent; parsing to JSON and re-serialising changes them
// and every signature check fails.
app.post(
  "/api/payments/webhook/stripe",
  express.raw({ type: "application/json" }),
  paymentController.stripeWebhook,
);

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// General API rate limit (security.md §4: 100 req/15 min), before any route.
// Webhook endpoints are mounted above (raw body) and auth has its own tighter
// per-route limits, so this is the safety net for everything else.
app.use("/api", rateLimit(100, 15 * 60 * 1000, "general"));

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
      title: "HealVista API",
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
app.use("/api/users", adminRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/queue", queueRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
// Clinical routes mount at /api so they can own several top-level nouns
// (/api/patients/:id/history, /api/prescriptions, /api/dependents).
app.use("/api", clinicalRoutes);
app.use("/api/lab", labRoutes);
app.use("/api/pharmacy", pharmacyRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/bills", billingRoutes);
app.use("/api/discounts", discountRouter);
app.use("/api/insurance", insuranceRouter);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/admin", adminComplianceRouter);
app.use("/api/me", meComplianceRouter);

// ─── Error handler (must be last) ──────────────────────────────────
app.use(errorHandler);

export default app;
