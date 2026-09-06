export type DailyStatsKey = "today" | "last-7d" | "last-30d" | "last-90d";
export const defaultDailyStatsKey: DailyStatsKey = "last-7d";
export const rowsPerPageOptions = [10, 20, 30, 60, 100];
export const defaultPageSize = 20;
