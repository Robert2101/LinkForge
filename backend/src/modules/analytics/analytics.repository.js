import { eq, and, desc, sql, gte } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { clicks, urls } from "../../db/schema.js";

export const analyticsRepository = {
  /**
   * Persist a click record and atomically increment the URL's counter
   */
  async recordClick({
    urlId,
    ipHash,
    userAgent,
    browser,
    os,
    device,
    referrer,
    country,
  }) {
    await Promise.all([
      db.insert(clicks).values({
        urlId,
        ipHash,
        userAgent,
        browser,
        os,
        device,
        referrer,
        country,
      }),
      db
        .update(urls)
        .set({
          clickCount: sql`${urls.clickCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(urls.id, urlId)),
    ]);
  },

  /**
   * High-level summary metrics for a specific URL
   */
  async getSummary(urlId) {
    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const past30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalClicksRow] = await db
      .select({ count: sql`count(*)` })
      .from(clicks)
      .where(eq(clicks.urlId, urlId));

    const [clicks24hRow] = await db
      .select({ count: sql`count(*)` })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.timestamp, past24h)));

    const [clicks7dRow] = await db
      .select({ count: sql`count(*)` })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.timestamp, past7d)));

    const [clicks30dRow] = await db
      .select({ count: sql`count(*)` })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.timestamp, past30d)));

    const [uniqueVisitorsRow] = await db
      .select({ count: sql`count(distinct ${clicks.ipHash})` })
      .from(clicks)
      .where(eq(clicks.urlId, urlId));

    return {
      totalClicks: Number(totalClicksRow?.count || 0),
      clicks24h: Number(clicks24hRow?.count || 0),
      clicks7d: Number(clicks7dRow?.count || 0),
      clicks30d: Number(clicks30dRow?.count || 0),
      uniqueVisitors: Number(uniqueVisitorsRow?.count || 0),
    };
  },

  /**
   * Click counts grouped by date for timeseries charts
   */
  async getTimeSeries(urlId, days = 14) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        date: sql`to_char(${clicks.timestamp}, 'YYYY-MM-DD')`,
        count: sql`count(*)`,
      })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.timestamp, cutoff)))
      .groupBy(sql`to_char(${clicks.timestamp}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${clicks.timestamp}, 'YYYY-MM-DD') ASC`);

    return rows.map((r) => ({
      date: r.date,
      clicks: Number(r.count),
    }));
  },

  /**
   * Categorical breakdown by device, browser, OS, and referrer
   */
  async getBreakdown(urlId) {
    const [devices, browsers, oses, referrers] = await Promise.all([
      db
        .select({
          name: sql`coalesce(${clicks.device}, 'Desktop')`,
          count: sql`count(*)`,
        })
        .from(clicks)
        .where(eq(clicks.urlId, urlId))
        .groupBy(sql`coalesce(${clicks.device}, 'Desktop')`)
        .orderBy(desc(sql`count(*)`))
        .limit(6),

      db
        .select({
          name: sql`coalesce(${clicks.browser}, 'Other')`,
          count: sql`count(*)`,
        })
        .from(clicks)
        .where(eq(clicks.urlId, urlId))
        .groupBy(sql`coalesce(${clicks.browser}, 'Other')`)
        .orderBy(desc(sql`count(*)`))
        .limit(6),

      db
        .select({
          name: sql`coalesce(${clicks.os}, 'Other')`,
          count: sql`count(*)`,
        })
        .from(clicks)
        .where(eq(clicks.urlId, urlId))
        .groupBy(sql`coalesce(${clicks.os}, 'Other')`)
        .orderBy(desc(sql`count(*)`))
        .limit(6),

      db
        .select({
          name: sql`coalesce(${clicks.referrer}, 'Direct / None')`,
          count: sql`count(*)`,
        })
        .from(clicks)
        .where(eq(clicks.urlId, urlId))
        .groupBy(sql`coalesce(${clicks.referrer}, 'Direct / None')`)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
    ]);

    const format = (items) =>
      items.map((i) => ({ name: String(i.name), count: Number(i.count) }));

    return {
      devices: format(devices),
      browsers: format(browsers),
      os: format(oses),
      referrers: format(referrers),
    };
  },

  /**
   * Overview dashboard metrics for an authenticated user across all their links
   */
  async getUserDashboardOverview(userId) {
    const [summaryRow] = await db
      .select({
        totalLinks: sql`count(*)`,
        totalClicks: sql`coalesce(sum(${urls.clickCount}), 0)`,
      })
      .from(urls)
      .where(eq(urls.userId, userId));

    const topLinks = await db
      .select({
        id: urls.id,
        shortCode: urls.shortCode,
        customAlias: urls.customAlias,
        originalUrl: urls.originalUrl,
        clickCount: urls.clickCount,
        isActive: urls.isActive,
        createdAt: urls.createdAt,
      })
      .from(urls)
      .where(eq(urls.userId, userId))
      .orderBy(desc(urls.clickCount))
      .limit(5);

    return {
      totalLinks: Number(summaryRow?.totalLinks || 0),
      totalClicks: Number(summaryRow?.totalClicks || 0),
      topLinks,
    };
  },
};
