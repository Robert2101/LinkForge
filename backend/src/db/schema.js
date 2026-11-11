import {
  pgTable,
  uuid,
  bigint,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Table definitions used by the query builder.
// The tables themselves are created by the SQL files in backend/migrations.
// Each index below exists for one specific query; the reason is written next to it.

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // UNIQUE creates the index used by login (lookup by email).
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 120 }),
  createdAt: createdAt(),
});

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Only a SHA-256 hash of the token is stored. UNIQUE gives the lookup index.
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    // All tokens descended from one login share a family, so a stolen token
    // can be answered by revoking the whole family.
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // "Revoke every token in this family" filters by family_id alone.
    index("refresh_tokens_family_id_idx").on(table.familyId),
    // Foreign key index: deleting a user cascades here, and expired-session
    // cleanup filters by user_id.
    index("refresh_tokens_user_id_idx").on(table.userId),
  ]
);

export const urls = pgTable(
  "urls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Null for links created without an account.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    originalUrl: text("original_url").notNull(),
    // The part after the slash. Either a generated code or a custom alias.
    // UNIQUE creates the index behind every redirect: one B-tree lookup.
    shortCode: varchar("short_code", { length: 32 }).notNull().unique(),
    isCustom: boolean("is_custom").default(false).notNull(),
    // Kept on the row so listing links never has to count the clicks table.
    clickCount: integer("click_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Dashboard list: WHERE user_id = ? ORDER BY created_at DESC LIMIT n.
    // Equality column first, sort column second, so Postgres reads the rows
    // already in order and stops after one page. Partial: anonymous links
    // (user_id IS NULL) are never listed, so they are left out of the index.
    index("urls_user_id_created_at_idx")
      .on(table.userId, table.createdAt.desc())
      .where(sql`${table.userId} is not null`),
  ]
);

export const clicks = pgTable(
  "clicks",
  {
    // Clicks are append-only and high volume. A sequential bigint key keeps
    // inserts at the right-hand edge of the index (random UUIDs scatter them).
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    urlId: uuid("url_id")
      .references(() => urls.id, { onDelete: "cascade" })
      .notNull(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
    // Salted hash of the visitor IP, used only to count unique visitors.
    ipHash: varchar("ip_hash", { length: 32 }),
    browser: varchar("browser", { length: 64 }),
    os: varchar("os", { length: 64 }),
    device: varchar("device", { length: 16 }),
    referrer: varchar("referrer", { length: 255 }),
    country: varchar("country", { length: 2 }),
  },
  (table) => [
    // Every analytics query is "clicks of one link inside a time range".
    // This index answers that directly, and also covers the foreign key.
    index("clicks_url_id_clicked_at_idx").on(table.urlId, table.clickedAt),
  ]
);
