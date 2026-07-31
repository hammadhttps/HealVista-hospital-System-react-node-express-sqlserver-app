import { env } from "./env.js";

export const allowedOrigins: string[] = [
  env.CLIENT_URL,
  ...(env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : []),
];
