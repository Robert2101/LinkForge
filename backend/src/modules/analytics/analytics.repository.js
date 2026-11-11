import { and, count, desc, eq, gte, sql, sum } from "drizzle-orm";
import { db } from "../../db/client.js";
import { clicks, urls } from "../../db/schema.js";

// All SQL for click analytics lives here.
// Every read filters by url_id plus a time range, which is exactly what the
// (url_id, clicked_at) index on the clicks table is built for.

// Clicks are grouped by calendar day in UTC, e.g. "2026-11-10".
const clickDay = sql`to_char(${clicks.clickedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

export const analyticsRepository = {
  // Saves a batch of clicks and adds them to each link's click_count.
  // One statement = one round trip to the database and one transaction:
  // the counters and the click rows can never disagree.
  async insertClicks(batch) {
    await db.execute(sql`
      -- 1. Turn the JSON array sent by the app into rows.
      with incoming as (
        select *
        from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as click(
          "urlId" uuid, "clickedAt" timestamptz, "ipHash" text,
          "browser" text, "os" text, "device" text, "referrer" text, "country" text
        )
      ),
      -- 2. Add the number of new clicks to each link. Links deleted in the
      --    meantime are simply not returned.
      counted as (
        update urls
        set click_count = urls.click_count + totals.new_clicks
        from (
          select "urlId", count(*)::int as new_clicks from incoming group by "urlId"
        ) as totals
        where urls.id = totals."urlId"
        returning urls.id
      )
      -- 3. Store the individual clicks, only for links that still exist.
      insert into clicks (url_id, clicked_at, ip_hash, browser, os, device, referrer, country)
      select "urlId", "clickedAt", "ipHash", "browser", "os", "device", "referrer", "country"
      from incoming
      join counted on counted.id = incoming."urlId"
    `);
  },

  // Headline numbers for one link, computed in a single pass over the index range.
  async linkTotals(urlId, since) {
    const [row] = await db
      .select({
        clicksInRange: count(),
        uniqueVisitors: sql`count(distinct ${clicks.ipHash})`.mapWith(Number),
        clicksLast24h:
          sql`count(*) filter (where ${clicks.clickedAt} >= now() - interval '24 hours')`.mapWith(Number),
      })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.clickedAt, since)));
    return row;
  },

  async linkClicksByDay(urlId, since) {
    return db
      .select({ date: clickDay, clicks: count() })
      .from(clicks)
      .where(and(eq(clicks.urlId, urlId), gte(clicks.clickedAt, since)))
      .groupBy(clickDay)
      .orderBy(clickDay);
  },

  // Clicks split by device, browser, operating system, referrer and country.
  // GROUPING SETS produces all five groupings from ONE scan of the link's
  // clicks, instead of running five separate queries.
  // Each result row is one value of one dimension, e.g. ("browsers", "Chrome", 42).
  async linkBreakdowns(urlId, since) {
    const { rows } = await db.execute(sql`
      select
        case
          when grouping(device) = 0 then 'devices'
          when grouping(browser) = 0 then 'browsers'
          when grouping(os) = 0 then 'operatingSystems'
          when grouping(referrer) = 0 then 'referrers'
          else 'countries'
        end as dimension,
        coalesce(device, browser, os, referrer, country) as name,
        count(*)::int as clicks
      from clicks
      where url_id = ${urlId} and clicked_at >= ${since.toISOString()}
      group by grouping sets ((device), (browser), (os), (referrer), (country))
      order by clicks desc
    `);
    return rows;
  },

  // Totals across all of a user's links. Reads click_count from the urls
  // table, so it never has to scan the (much larger) clicks table.
  async userTotals(userId) {
    const [row] = await db
      .select({
        links: count(),
        activeLinks: sql`count(*) filter (where ${urls.isActive})`.mapWith(Number),
        clicks: sum(urls.clickCount).mapWith(Number),
      })
      .from(urls)
      .where(eq(urls.userId, userId));
    return { links: row.links, activeLinks: row.activeLinks, clicks: row.clicks ?? 0 };
  },

  async userClicksByDay(userId, since) {
    return db
      .select({ date: clickDay, clicks: count() })
      .from(clicks)
      .innerJoin(urls, eq(urls.id, clicks.urlId))
      .where(and(eq(urls.userId, userId), gte(clicks.clickedAt, since)))
      .groupBy(clickDay)
      .orderBy(clickDay);
  },

  async userTopLinks(userId, limit) {
    return db
      .select({
        id: urls.id,
        shortCode: urls.shortCode,
        originalUrl: urls.originalUrl,
        clickCount: urls.clickCount,
      })
      .from(urls)
      .where(eq(urls.userId, userId))
      .orderBy(desc(urls.clickCount))
      .limit(limit);
  },
};
