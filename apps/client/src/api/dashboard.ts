import api from "./axiosClient";
import type { AnalyticsOverview, DashboardData } from "@healvista/shared";

/**
 * Role dashboards (6.1) and operational analytics (6.2).
 *
 * Both endpoints return values already aggregated in SQL on the server — the
 * client only renders. `/dashboard` is role-filtered server-side, so there is no
 * role parameter to pass.
 */
export const dashboardApi = {
  get: () => api.get("/dashboard").then((r) => r.data.data as DashboardData),
};

export interface AnalyticsRange {
  from?: string;
  to?: string;
}

export const analyticsApi = {
  overview: (range: AnalyticsRange = {}) =>
    api.get("/analytics/overview", { params: range }).then((r) => r.data.data as AnalyticsOverview),
};
