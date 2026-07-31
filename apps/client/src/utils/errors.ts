export function getErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  const data = (err as { response?: { data?: { error?: unknown; message?: unknown } } })?.response
    ?.data;
  const raw = data?.error ?? data?.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const message = (raw as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
