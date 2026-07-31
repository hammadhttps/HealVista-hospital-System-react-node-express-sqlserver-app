export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const response = (
    err as {
      response?: {
        status?: number;
        headers?: Record<string, unknown>;
        data?: { error?: unknown; message?: unknown };
      };
    }
  )?.response;

  if (response?.status === 429) {
    const retryAfter = response.headers?.["retry-after"];
    const seconds = typeof retryAfter === "string" ? Number(retryAfter) : NaN;
    if (Number.isFinite(seconds) && seconds > 0) {
      const minutes = Math.ceil(seconds / 60);
      return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
  }

  const raw = response?.data?.error ?? response?.data?.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
