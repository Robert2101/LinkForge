-- Schema cleanup and index redesign.
-- Each index that remains serves one named query (see src/db/schema.js).

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- users_email_unique (the UNIQUE constraint) already indexes email;
-- this second identical index only slowed down writes.
DROP INDEX "users_email_idx";
ALTER TABLE "users" DROP COLUMN "role";
ALTER TABLE "users" DROP COLUMN "updated_at";

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
-- Duplicate of refresh_tokens_token_hash_unique.
DROP INDEX "refresh_tokens_hash_idx";
-- (user_id, family_id) cannot serve "WHERE family_id = ?" because family_id
-- is not the leading column. Replaced by two single-purpose indexes below.
DROP INDEX "refresh_tokens_family_idx";

-- A timestamp instead of a boolean: it also tells us *when* a token was used,
-- which lets the server tell a harmless double request from a replay attack.
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_at" timestamp with time zone;
UPDATE "refresh_tokens" SET "revoked_at" = now() WHERE "is_revoked";
ALTER TABLE "refresh_tokens" DROP COLUMN "is_revoked";
ALTER TABLE "refresh_tokens" ALTER COLUMN "token_hash" TYPE varchar(64);

CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");

-- ---------------------------------------------------------------------------
-- urls
-- ---------------------------------------------------------------------------
-- A custom alias was stored twice (short_code and custom_alias), so every
-- redirect ran "short_code = ? OR custom_alias = ?" across two indexes.
-- Now short_code is the only lookup key and is_custom records where it came from.
ALTER TABLE "urls" ADD COLUMN "is_custom" boolean DEFAULT false NOT NULL;
UPDATE "urls" SET "is_custom" = true WHERE "custom_alias" IS NOT NULL;
DROP INDEX "urls_custom_alias_idx";
ALTER TABLE "urls" DROP COLUMN "custom_alias";

-- Duplicate of urls_short_code_unique.
DROP INDEX "urls_short_code_idx";

-- The dashboard lists a user's links newest first. With (user_id, created_at DESC)
-- Postgres reads the rows already sorted and stops after one page.
-- Partial index: anonymous links have no owner and are never listed.
DROP INDEX "urls_user_id_idx";
CREATE INDEX "urls_user_id_created_at_idx" ON "urls" ("user_id", "created_at" DESC)
  WHERE "user_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- clicks
-- ---------------------------------------------------------------------------
-- clicks_url_id_idx was a prefix of the composite index, so it was redundant.
DROP INDEX "clicks_url_id_idx";
DROP INDEX "clicks_url_timestamp_idx";

ALTER TABLE "clicks" RENAME COLUMN "timestamp" TO "clicked_at";

-- The raw user-agent string is no longer stored; browser, os and device keep
-- everything the reports use.
ALTER TABLE "clicks" DROP COLUMN "user_agent";

-- Append-only table: a sequential key keeps inserts on the newest index page.
ALTER TABLE "clicks" DROP CONSTRAINT "clicks_pkey";
ALTER TABLE "clicks" DROP COLUMN "id";
ALTER TABLE "clicks" ADD COLUMN "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;

-- "No referrer" is now NULL rather than the word "Direct".
UPDATE "clicks" SET "referrer" = NULL WHERE "referrer" = 'Direct';
ALTER TABLE "clicks" ALTER COLUMN "referrer" TYPE varchar(255) USING left("referrer", 255);
ALTER TABLE "clicks" ALTER COLUMN "country" TYPE varchar(2) USING left("country", 2);
ALTER TABLE "clicks" ALTER COLUMN "device" TYPE varchar(16) USING left("device", 16);
ALTER TABLE "clicks" ALTER COLUMN "ip_hash" TYPE varchar(32) USING left("ip_hash", 32);

-- Every analytics query is "clicks of one link within a time range".
-- Equality column (url_id) first, range column (clicked_at) second.
-- It also covers the foreign key, so deleting a link cascades quickly.
CREATE INDEX "clicks_url_id_clicked_at_idx" ON "clicks" ("url_id", "clicked_at");
