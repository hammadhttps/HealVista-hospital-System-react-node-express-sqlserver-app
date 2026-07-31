import { env } from "../config/env";

interface SmsProvider {
  send(to: string, body: string): Promise<boolean>;
}

class TwilioProvider implements SmsProvider {
  private client: import("twilio").Twilio | null = null;

  private getClient(): import("twilio").Twilio | null {
    if (this.client) return this.client;
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      console.warn("[sms] Twilio not configured");
      return null;
    }
    const twilio = require("twilio");
    this.client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    return this.client;
  }

  async send(to: string, body: string): Promise<boolean> {
    const client = this.getClient();
    if (!client || !env.TWILIO_PHONE_NUMBER) return false;
    try {
      await client.messages.create({
        body,
        to,
        from: env.TWILIO_PHONE_NUMBER,
      });
      return true;
    } catch (err) {
      console.error("[sms] send failed:", err);
      return false;
    }
  }
}

class NoopProvider implements SmsProvider {
  async send(_to: string, _body: string): Promise<boolean> {
    return false;
  }
}

const provider: SmsProvider = new TwilioProvider();

const TEMPLATES: Record<string, (data: Record<string, string>) => string> = {
  APPOINTMENT_CONFIRMED: (d) =>
    `Appointment confirmed with Dr. ${d.doctorName} on ${d.date} at ${d.time}. No: ${d.appointmentNo}`,
  APPOINTMENT_RESCHEDULED: (d) =>
    `Appointment rescheduled to ${d.newDate} at ${d.newTime} with Dr. ${d.doctorName}.`,
  APPOINTMENT_CANCELLED: (d) =>
    `Appointment with Dr. ${d.doctorName} on ${d.date} cancelled. Reason: ${d.reason}`,
  APPOINTMENT_REMINDER: (d) =>
    `Reminder: Appointment with Dr. ${d.doctorName} at ${d.time} on ${d.date}.`,
  PAYMENT_RECEIPT: (d) => `Payment of $${d.amount} received. Receipt: ${d.receiptUrl}`,
  LAB_RESULT_READY: (d) => `Lab results for ${d.testName} are ready. Log in to view.`,
  FOLLOW_UP_REMINDER: (d) => `Please book a follow-up with Dr. ${d.doctorName}.`,
};

export async function sendSms(
  to: string,
  type: string,
  data: Record<string, string>,
): Promise<boolean> {
  const template = TEMPLATES[type];
  if (!template) return false;
  const body = template(data);
  return provider.send(to, body);
}
