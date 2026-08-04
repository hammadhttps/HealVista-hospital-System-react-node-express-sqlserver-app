import { QueryClient } from "@tanstack/react-query";

/**
 * Client-side cache policy.
 *
 * Tuned for a hospital API on Render behind a managed Postgres: requests are not
 * cheap, and a free-tier instance can be cold. The defaults below aim to make
 * navigation feel instant without ever showing a clinician a stale number
 * without a refresh behind it.
 */

/** Errors that will never succeed on retry — retrying them only adds latency. */
function isTerminal(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Navigating back to a screen inside a minute reuses what's already there.
      staleTime: 60 * 1000,
      // When filters change or a refetch is slow, keep the last successful
      // payload painted while the next request runs. This matters when Redis is
      // disabled/exhausted and reads fall straight through to Postgres.
      placeholderData: (previousData: unknown) => previousData,
      // Keep it in memory well past staleness so a revisit paints from cache and
      // revalidates behind the user, rather than flashing a spinner.
      gcTime: 15 * 60 * 1000,
      // Refetch on focus: a doctor returning to the tab after a consultation
      // must not act on a queue that stopped updating while it was hidden. It
      // was off, which is the wrong default for data that changes underneath you.
      refetchOnWindowFocus: true,
      // A dropped connection is the common failure on mobile in a hospital, so
      // reconnecting should re-sync rather than sit on stale data.
      refetchOnReconnect: true,
      retry: (failureCount, error) => (isTerminal(error) ? false : failureCount < 2),
      // Backoff, capped: a cold Render instance takes a few seconds to wake, and
      // hammering it immediately makes that worse.
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Writes are not idempotent — a retried "dispense" or "collect payment" is
      // a real-world duplicate. Surface the failure and let the user decide.
      retry: false,
    },
  },
});
