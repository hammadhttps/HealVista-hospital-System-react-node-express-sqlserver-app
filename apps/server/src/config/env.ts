import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  CLIENT_URL: z.string().url(),
  CORS_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),
  // Kill switch for Redis — see the header of `config/redis.ts` for exactly what
  // degrades. Set `REDIS_ENABLED=false` when the Upstash free tier has burned
  // through its monthly command quota: past that every command is rejected, so
  // continuing to issue them only adds a failing round trip to each request.
  // Accepts "false"/"0" as off; anything else (including unset) is on.
  REDIS_ENABLED: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((v) => v === "true" || v === "1"),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  JINA_API_KEY: z.string().optional(),
  JINA_CHAT_MODEL: z.string().default("jina-vlm"),
  JINA_EMBED_MODEL: z.string().default("jina-embeddings-v5-text-small"),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email delivery is deliberately not part of this build. The SMTP service,
  // worker and queue were removed; these variables were all that remained, and a
  // config key with nothing reading it is worse than no key at all — it implies
  // a feature that does not exist. Notifications are delivered in-app and by
  // SMS. See "Deliberate omissions" in the README.

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  const flat = parsed.error.flatten();
  for (const [key, msgs] of Object.entries(flat.fieldErrors)) {
    for (const msg of msgs) {
      console.error(`  ${key}: ${msg}`);
    }
  }
  process.exit(1);
}

export const env = parsed.data;
