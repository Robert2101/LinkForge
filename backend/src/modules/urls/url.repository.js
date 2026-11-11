import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { urls } from "../../db/schema.js";

// All SQL for the urls table lives here.

// A user's links, optionally narrowed by a search term.
function ownedBy(userId, search) {
  const isOwner = eq(urls.userId, userId);
  if (!search) return isOwner;

  // % and _ are wildcards in LIKE. Escape them so they are matched literally.
  const term = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  return and(isOwner, or(ilike(urls.shortCode, term), ilike(urls.originalUrl, term)));
}

export const urlRepository = {
  // Returns the new row, or null when the short code is already taken.
  // The UNIQUE index on short_code decides, so there is no gap between
  // "check if free" and "insert" for another request to slip into.
  async insert({ userId, originalUrl, shortCode, isCustom, expiresAt }) {
    const [row] = await db
      .insert(urls)
      .values({ userId, originalUrl, shortCode, isCustom, expiresAt })
      .onConflictDoNothing({ target: urls.shortCode })
      .returning();
    return row ?? null;
  },

  // The redirect lookup. One exact-match read on the unique short_code index,
  // fetching only the columns a redirect needs.
  async findByShortCode(shortCode) {
    const [row] = await db
      .select({
        id: urls.id,
        originalUrl: urls.originalUrl,
        isActive: urls.isActive,
        expiresAt: urls.expiresAt,
      })
      .from(urls)
      .where(eq(urls.shortCode, shortCode))
      .limit(1);
    return row ?? null;
  },

  async findOwned(id, userId) {
    const [row] = await db
      .select()
      .from(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .limit(1);
    return row ?? null;
  },

  // Served by the (user_id, created_at DESC) index: rows come out already sorted.
  async listByUser(userId, { limit, offset, search }) {
    return db
      .select()
      .from(urls)
      .where(ownedBy(userId, search))
      .orderBy(desc(urls.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async countByUser(userId, search) {
    const [row] = await db.select({ total: count() }).from(urls).where(ownedBy(userId, search));
    return row.total;
  },

  async update(id, userId, fields) {
    const [row] = await db
      .update(urls)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning();
    return row ?? null;
  },

  async remove(id, userId) {
    const [row] = await db
      .delete(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning({ shortCode: urls.shortCode });
    return row ?? null;
  },
};
