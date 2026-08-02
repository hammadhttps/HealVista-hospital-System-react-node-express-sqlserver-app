import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

let transporter: nodemailer.Transporter | null = null;

/** True when SMTP credentials are present and a transporter can be built. */
export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/**
 * Whether the mailer is active at all: either real SMTP or `MAILER=log`.
 * The email worker skips (not fails) a job when this is false, so an
 * unconfigured server stops spamming failures instead of retrying forever.
 */
export function isEmailEnabled(): boolean {
  return env.MAILER === "log" || isEmailConfigured();
}

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;
  if (!isEmailConfigured()) {
    logger.warn("[email] SMTP not configured");
    return null;
  }
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

const TEMPLATES: Record<
  string,
  (data: Record<string, string>) => { subject: string; html: string }
> = {
  APPOINTMENT_CONFIRMED: (d) => ({
    subject: "Appointment Confirmed",
    html: `<p>Your appointment with Dr. ${d.doctorName} on ${d.date} at ${d.time} is confirmed.</p><p>Appointment No: ${d.appointmentNo}</p>`,
  }),
  APPOINTMENT_RESCHEDULED: (d) => ({
    subject: "Appointment Rescheduled",
    html: `<p>Your appointment with Dr. ${d.doctorName} has been moved to ${d.newDate} at ${d.newTime}.</p>`,
  }),
  APPOINTMENT_CANCELLED: (d) => ({
    subject: "Appointment Cancelled",
    html: `<p>Your appointment with Dr. ${d.doctorName} on ${d.date} has been cancelled.</p><p>Reason: ${d.reason}</p>`,
  }),
  APPOINTMENT_REMINDER: (d) => ({
    subject: "Appointment Reminder",
    html: `<p>Reminder: You have an appointment with Dr. ${d.doctorName} at ${d.time} on ${d.date}.</p>`,
  }),
  PAYMENT_RECEIPT: (d) => ({
    subject: "Payment Receipt",
    html: `<p>Payment of $${d.amount} for ${d.description} has been received.</p><p>Receipt: ${d.receiptUrl}</p>`,
  }),
  LAB_RESULT_READY: (d) => ({
    subject: "Lab Results Ready",
    html: `<p>Your lab results for ${d.testName} are ready. Please log in to view them.</p>`,
  }),
  LOW_STOCK_ALERT: (d) => ({
    subject: `Low Stock Alert: ${d.itemName}`,
    html: `<p>Stock for ${d.itemName} is low (${d.quantity} remaining). Please reorder.</p>`,
  }),
  FOLLOW_UP_REMINDER: (d) => ({
    subject: "Follow-Up Reminder",
    html: `<p>It's time to book a follow-up appointment with Dr. ${d.doctorName}.</p>`,
  }),
};

export async function sendEmail(
  to: string,
  type: string,
  data: Record<string, string>,
): Promise<boolean> {
  const template = TEMPLATES[type];
  if (!template) {
    logger.warn({ type }, "[email] No template for type");
    return false;
  }
  const { subject, html } = template(data);

  if (env.MAILER === "log") {
    logger.info({ to, type, subject, html }, "[email] [log-mode] would send");
    return true;
  }

  const t = getTransporter();
  if (!t) return false;

  try {
    await t.sendMail({
      from: env.MAIL_FROM,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    logger.error({ err, to, type }, "[email] send failed");
    return false;
  }
}
