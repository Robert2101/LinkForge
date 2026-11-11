import QRCode from "qrcode";
import { env } from "../../config/env.js";
import { AppError, conflict, notFound } from "../../lib/errors.js";
import { cacheLink, forgetCachedLink, readCachedLink } from "./url.cache.js";
import { generateShortCode, RESERVED_CODES } from "./shortCode.js";
import { urlRepository } from "./url.repository.js";

const MAX_CODE_ATTEMPTS = 5;

// What the API returns for a link: the database row plus its full short URL.
function toPublicLink(row) {
  return { ...row, shortUrl: `${env.BASE_URL}/${row.shortCode}` };
}

// The few fields a redirect needs. This is what gets cached.
function toCachedLink({ id, originalUrl, isActive, expiresAt }) {
  return { id, originalUrl, isActive, expiresAt };
}

async function insertWithGeneratedCode(link) {
  // With 3.5 trillion possible codes a collision is rare, but the database
  // (not luck) guarantees uniqueness: on a clash, try again with a new code.
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const shortCode = generateShortCode();
    if (RESERVED_CODES.has(shortCode.toLowerCase())) continue;

    const row = await urlRepository.insert({ ...link, shortCode, isCustom: false });
    if (row) return row;
  }
  throw new AppError(503, "CODE_GENERATION_FAILED", "Could not create a short link right now. Try again.");
}

// Database lookups that are in progress right now, by short code.
// If 500 requests for the same uncached link arrive together, the first one
// queries Postgres and the other 499 wait for that same answer instead of
// sending 499 identical queries (a "cache stampede").
const lookupsInProgress = new Map();

async function loadLinkFromDatabase(shortCode) {
  const row = await urlRepository.findByShortCode(shortCode);
  await cacheLink(shortCode, row);
  return row;
}

export const urlService = {
  async createLink({ userId, originalUrl, customAlias, expiresAt }) {
    const link = {
      userId: userId ?? null,
      originalUrl,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };

    let row;
    if (customAlias) {
      row = await urlRepository.insert({ ...link, shortCode: customAlias, isCustom: true });
      if (!row) throw conflict(`"${customAlias}" is already taken. Choose another name.`);
    } else {
      row = await insertWithGeneratedCode(link);
    }

    // Put the new link in the cache straight away. This also replaces any
    // "does not exist" entry left by someone who tried the code earlier.
    await cacheLink(row.shortCode, toCachedLink(row));
    return toPublicLink(row);
  },

  async listLinks(userId, { page, limit, search }) {
    const offset = (page - 1) * limit;
    const [rows, total] = await Promise.all([
      urlRepository.listByUser(userId, { limit, offset, search }),
      urlRepository.countByUser(userId, search),
    ]);
    return {
      items: rows.map(toPublicLink),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  },

  // Every read and write below includes the owner's id in the query itself.
  // A link that belongs to someone else is simply "not found", so one user
  // can never learn about, change or delete another user's link.
  async getLink(id, userId) {
    const row = await urlRepository.findOwned(id, userId);
    if (!row) throw notFound("Link not found");
    return toPublicLink(row);
  },

  async updateLink(id, userId, changes) {
    const fields = { ...changes };
    if (fields.expiresAt) fields.expiresAt = new Date(fields.expiresAt);

    const row = await urlRepository.update(id, userId, fields);
    if (!row) throw notFound("Link not found");

    await forgetCachedLink(row.shortCode);
    return toPublicLink(row);
  },

  async deleteLink(id, userId) {
    const removed = await urlRepository.remove(id, userId);
    if (!removed) throw notFound("Link not found");
    await forgetCachedLink(removed.shortCode);
  },

  // Finds where a short code points. Used by every redirect.
  // `cache` reports how the answer was found and is sent as the X-Cache header:
  //   HIT   answered from Redis, Postgres was not contacted
  //   MISS  read from Postgres, then stored in Redis for the next visitor
  async resolveShortCode(shortCode) {
    const cached = await readCachedLink(shortCode);
    if (cached !== undefined) return { link: cached, cache: "HIT" };

    let lookup = lookupsInProgress.get(shortCode);
    if (!lookup) {
      lookup = loadLinkFromDatabase(shortCode).finally(() => lookupsInProgress.delete(shortCode));
      lookupsInProgress.set(shortCode, lookup);
    }
    return { link: await lookup, cache: "MISS" };
  },

  async renderQrCode(shortCode, format) {
    const { link } = await this.resolveShortCode(shortCode);
    if (!link) throw notFound("Link not found");

    const target = `${env.BASE_URL}/${shortCode}`;
    const options = { margin: 2, width: 512, errorCorrectionLevel: "M" };

    return format === "png"
      ? { contentType: "image/png", body: await QRCode.toBuffer(target, { ...options, type: "png" }) }
      : { contentType: "image/svg+xml", body: await QRCode.toString(target, { ...options, type: "svg" }) };
  },
};
