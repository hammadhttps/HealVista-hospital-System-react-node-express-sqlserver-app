import { prisma } from "../config/db.js";
import { getCached, setCached } from "../config/redis.js";
import type { UpdateSettingsInput } from "@healvista/shared";

const SETTINGS_CACHE_KEY = "hospital:settings";
const SETTINGS_ID = "singleton";

export async function get() {
  const cached = await getCached<unknown>(SETTINGS_CACHE_KEY);
  if (cached) return cached;

  const settings = await prisma.hospitalSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (!settings) {
    return prisma.hospitalSettings.create({
      data: { id: SETTINGS_ID, name: "HealVista Hospital" },
    });
  }

  await setCached(SETTINGS_CACHE_KEY, settings, 300);
  return settings;
}

export async function update(input: UpdateSettingsInput) {
  const settings = await prisma.hospitalSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input } as any,
    update: input,
  });
  await setCached(SETTINGS_CACHE_KEY, settings, 300);
  return settings;
}
