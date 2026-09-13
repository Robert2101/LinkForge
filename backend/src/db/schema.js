import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// 1. Users Table
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }),
    role: varchar("role", { length: 20 }).default("user").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
  ]
);

// ---------------------------------------------------------------------------
// 2. Refresh Tokens Table (Token Rotation & Family Reuse Detection)
// ---------------------------------------------------------------------------
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull().unique(),
    familyId: uuid("family_id").notNull(),
    isRevoked: boolean("is_revoked").default(false).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("refresh_tokens_hash_idx").on(table.tokenHash),
    index("refresh_tokens_family_idx").on(table.userId, table.familyId),
  ]
);

// ---------------------------------------------------------------------------
// 3. URLs Table
// ---------------------------------------------------------------------------
export const urls = pgTable(
  "urls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    originalUrl: text("original_url").notNull(),
    shortCode: varchar("short_code", { length: 32 }).notNull().unique(),
    customAlias: varchar("custom_alias", { length: 64 }).unique(),
    clickCount: integer("click_count").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("urls_short_code_idx").on(table.shortCode),
    uniqueIndex("urls_custom_alias_idx").on(table.customAlias),
    index("urls_user_id_idx").on(table.userId),
  ]
);

// ---------------------------------------------------------------------------
// 4. Click Analytics Table
// ---------------------------------------------------------------------------
export const clicks = pgTable(
  "clicks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    urlId: uuid("url_id")
      .references(() => urls.id, { onDelete: "cascade" })
      .notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgent: text("user_agent"),
    browser: varchar("browser", { length: 64 }),
    os: varchar("os", { length: 64 }),
    device: varchar("device", { length: 64 }),
    referrer: text("referrer"),
    country: varchar("country", { length: 64 }),
  },
  (table) => [
    index("clicks_url_id_idx").on(table.urlId),
    index("clicks_url_timestamp_idx").on(table.urlId, table.timestamp),
  ]
);

// ---------------------------------------------------------------------------
// Relations Definition
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  urls: many(urls),
  refreshTokens: many(refreshTokens),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const urlsRelations = relations(urls, ({ one, many }) => ({
  user: one(users, {
    fields: [urls.userId],
    references: [users.id],
  }),
  clicks: many(clicks),
}));

export const clicksRelations = relations(clicks, ({ one }) => ({
  url: one(urls, {
    fields: [clicks.urlId],
    references: [urls.id],
  }),
}));
