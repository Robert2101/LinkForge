import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { urls } from "../../db/schema.js";

export const urlRepository = {
  async create({
    userId,
    originalUrl,
    shortCode,
    customAlias,
    expiresAt,
  }) {
    const [record] = await db
      .insert(urls)
      .values({
        userId,
        originalUrl,
        shortCode,
        customAlias,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      })
      .returning();
    return record;
  },

  async findByShortCode(shortCode) {
    const [record] = await db
      .select()
      .from(urls)
      .where(or(eq(urls.shortCode, shortCode), eq(urls.customAlias, shortCode)))
      .limit(1);
    return record || null;
  },

  async findById(id) {
    const [record] = await db
      .select()
      .from(urls)
      .where(eq(urls.id, id))
      .limit(1);
    return record || null;
  },

  async listByUserId(userId, { limit = 20, offset = 0, search }) {
    let condition = eq(urls.userId, userId);

    if (search) {
      condition = and(
        condition,
        or(
          ilike(urls.originalUrl, `%${search}%`),
          ilike(urls.shortCode, `%${search}%`),
          ilike(urls.customAlias, `%${search}%`)
        )
      );
    }

    return await db
      .select()
      .from(urls)
      .where(condition)
      .orderBy(desc(urls.createdAt))
      .limit(limit)
      .offset(offset);
  },

  async countByUserId(userId, search) {
    let condition = eq(urls.userId, userId);

    if (search) {
      condition = and(
        condition,
        or(
          ilike(urls.originalUrl, `%${search}%`),
          ilike(urls.shortCode, `%${search}%`),
          ilike(urls.customAlias, `%${search}%`)
        )
      );
    }

    const [result] = await db
      .select({ count: sql`count(*)` })
      .from(urls)
      .where(condition);
    return Number(result?.count || 0);
  },

  async update(id, userId, fields) {
    const updateValues = { ...fields, updatedAt: new Date() };
    if (updateValues.expiresAt) {
      updateValues.expiresAt = new Date(updateValues.expiresAt);
    }

    const [updated] = await db
      .update(urls)
      .set(updateValues)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning();
    return updated || null;
  },

  async delete(id, userId) {
    const [deleted] = await db
      .delete(urls)
      .where(and(eq(urls.id, id), eq(urls.userId, userId)))
      .returning();
    return deleted || null;
  },

  async incrementClickCount(id) {
    await db
      .update(urls)
      .set({
        clickCount: sql`${urls.clickCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(urls.id, id));
  },
};
