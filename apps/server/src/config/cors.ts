import { env } from "./env.js";

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/+$/, "").toLowerCase();
}

const configured = [
  env.CLIENT_URL,
  ...(env.CORS_ORIGINS
    ? env.CORS_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : []),
];

export const allowedOrigins: string[] = [...new Set(configured.map(normalizeOrigin))];

export function isOriginAllowed(origin: string): boolean {
  return allowedOrigins.includes(normalizeOrigin(origin));
}

console.log(`[cors] allowing origins: ${allowedOrigins.join(", ")}`);
