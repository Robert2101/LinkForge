import { env } from "../../config/env.js";
import { urlService } from "../urls/url.service.js";
import { analyticsRepository } from "./analytics.repository.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const BREAKDOWN_ROWS = 6; // show the top 6 of each breakdown

// Midnight UTC, `days - 1` days ago: the range covers `days` whole calendar days including today.
function startOfRange(days) {
  const todayUtc = new Date(new Date().toISOString().slice(0, 10));
  return new Date(todayUtc.getTime() - (days - 1) * DAY_MS);
}

// The database only returns days that had clicks. Charts need every day,
// so the gaps are filled with zeros here.
function fillMissingDays(rows, since, days) {
  const clicksByDate = new Map(rows.map((row) => [row.date, row.clicks]));
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(since.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    return { date, clicks: clicksByDate.get(date) ?? 0 };
  });
}

// Turns the flat (dimension, name, clicks) rows into { devices: [...], browsers: [...], ... }.
function groupBreakdowns(rows) {
  const breakdowns = { devices: [], browsers: [], operatingSystems: [], referrers: [], countries: [] };
  for (const { dimension, name, clicks } of rows) {
    const list = breakdowns[dimension];
    if (list.length >= BREAKDOWN_ROWS) continue; // rows arrive sorted, most clicks first

    // A missing referrer means the visitor typed or pasted the link.
    const fallback = dimension === "referrers" ? "Direct" : "Unknown";
    list.push({ name: name ?? fallback, clicks });
  }
  return breakdowns;
}

export const analyticsService = {
  // Everything the dashboard's overview needs, in one response.
  async getOverview(userId, days) {
    const since = startOfRange(days);

    // Three independent queries: run them at the same time, not one after another.
    const [totals, clicksByDay, topLinks] = await Promise.all([
      analyticsRepository.userTotals(userId),
      analyticsRepository.userClicksByDay(userId, since),
      analyticsRepository.userTopLinks(userId, 5),
    ]);

    const timeseries = fillMissingDays(clicksByDay, since, days);
    return {
      days,
      totals: { ...totals, clicksInRange: timeseries.reduce((total, day) => total + day.clicks, 0) },
      timeseries,
      topLinks: topLinks.map((link) => ({ ...link, shortUrl: `${env.BASE_URL}/${link.shortCode}` })),
    };
  },

  // Everything the page for a single link needs, in one response.
  async getLinkAnalytics(linkId, userId, days) {
    // Throws "not found" unless the link belongs to this user.
    const link = await urlService.getLink(linkId, userId);
    const since = startOfRange(days);

    const [totals, clicksByDay, breakdownRows] = await Promise.all([
      analyticsRepository.linkTotals(linkId, since),
      analyticsRepository.linkClicksByDay(linkId, since),
      analyticsRepository.linkBreakdowns(linkId, since),
    ]);

    return {
      link,
      days,
      totals: { clicks: link.clickCount, ...totals },
      timeseries: fillMissingDays(clicksByDay, since, days),
      breakdowns: groupBreakdowns(breakdownRows),
    };
  },
};
