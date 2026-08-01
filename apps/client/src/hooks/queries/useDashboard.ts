import { useQuery } from "@tanstack/react-query";
import { analyticsApi, dashboardApi, type AnalyticsRange } from "../../api/dashboard";

export const dashboardKeys = {
  all: ["dashboard"] as const,
};

export const analyticsKeys = {
  all: ["analytics"] as const,
  overview: (range: AnalyticsRange) => [...analyticsKeys.all, "overview", range] as const,
};

/**
 * The caller's role-appropriate KPI set. The server caches for 60s, so a short
 * client stale time keeps the two in step without hammering the endpoint.
 */
export function useDashboard() {
  return useQuery({
    queryKey: dashboardKeys.all,
    queryFn: dashboardApi.get,
    staleTime: 60_000,
  });
}

/** Admin date-range operational analytics. */
export function useAnalyticsOverview(range: AnalyticsRange) {
  return useQuery({
    queryKey: analyticsKeys.overview(range),
    queryFn: () => analyticsApi.overview(range),
    staleTime: 60_000,
  });
}
