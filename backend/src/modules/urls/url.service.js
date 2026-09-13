import QRCode from "qrcode";
import { generateShortCode } from "./base62.js";
import { urlRepository } from "./url.repository.js";
import { redis } from "../../lib/redis.js";
import { env } from "../../config/env.js";
import {
  ConflictError,
  NotFoundError,
  ForbiddenError,
  AppError,
} from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

const CACHE_TTL_SECONDS = 86400; // 24 hours

export const urlService = {
  /**
   * Create a shortened URL (Guest or Authenticated)
   */
  async createUrl({ userId, originalUrl, customAlias, expiresAt }) {
    let shortCode;

    if (customAlias) {
      // Check if alias is already taken
      const existing = await urlRepository.findByShortCode(customAlias);
      if (existing) {
        throw new ConflictError("Custom alias is already in use");
      }
      shortCode = customAlias;
    } else {
      // Collision-resistant CSPRNG Base62 generation
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const candidate = generateShortCode(7);
        const existing = await urlRepository.findByShortCode(candidate);
        if (!existing) {
          shortCode = candidate;
          break;
        }
        attempts++;
        logger.warn({ candidate, attempts }, "Base62 collision encountered, retrying");
      }

      if (!shortCode) {
        throw new AppError(
          "Failed to generate unique short-code after multiple attempts. Please try again.",
          500
        );
      }
    }

    try {
      const urlRecord = await urlRepository.create({
        userId: userId || null,
        originalUrl,
        shortCode,
        customAlias: customAlias || null,
        expiresAt: expiresAt || null,
      });

      // Warm up Redis cache immediately
      const cachePayload = JSON.stringify({
        id: urlRecord.id,
        originalUrl: urlRecord.originalUrl,
        isActive: urlRecord.isActive,
        expiresAt: urlRecord.expiresAt,
      });

      await redis.set(`cache:url:${urlRecord.shortCode}`, cachePayload, "EX", CACHE_TTL_SECONDS);
      if (urlRecord.customAlias) {
        await redis.set(`cache:url:${urlRecord.customAlias}`, cachePayload, "EX", CACHE_TTL_SECONDS);
      }

      return {
        ...urlRecord,
        shortUrl: `${env.BASE_URL}/${urlRecord.customAlias || urlRecord.shortCode}`,
      };
    } catch (err) {
      if (err.code === "23505") {
        throw new ConflictError("Custom alias or short code already exists in database");
      }
      throw err;
    }
  },

  /**
   * List URLs for the authenticated user
   */
  async listUserUrls(userId, { page = 1, limit = 20, search }) {
    const offset = (page - 1) * limit;
    const [urlsList, total] = await Promise.all([
      urlRepository.listByUserId(userId, { limit, offset, search }),
      urlRepository.countByUserId(userId, search),
    ]);

    const items = urlsList.map((item) => ({
      ...item,
      shortUrl: `${env.BASE_URL}/${item.customAlias || item.shortCode}`,
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single URL by ID
   */
  async getUrlById(id, userId) {
    const url = await urlRepository.findById(id);
    if (!url) {
      throw new NotFoundError("URL not found");
    }

    if (userId && url.userId && url.userId !== userId) {
      throw new ForbiddenError("You do not have permission to view this URL");
    }

    return {
      ...url,
      shortUrl: `${env.BASE_URL}/${url.customAlias || url.shortCode}`,
    };
  },

  /**
   * Update URL destination, active state, or expiration
   */
  async updateUrl(id, userId, fields) {
    const existing = await urlRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("URL not found");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError("You do not have permission to update this URL");
    }

    const updated = await urlRepository.update(id, userId, fields);

    // Invalidate Redis cache for both shortCode and customAlias
    await redis.del(`cache:url:${existing.shortCode}`);
    if (existing.customAlias) {
      await redis.del(`cache:url:${existing.customAlias}`);
    }

    return {
      ...updated,
      shortUrl: `${env.BASE_URL}/${updated.customAlias || updated.shortCode}`,
    };
  },

  /**
   * Delete URL
   */
  async deleteUrl(id, userId) {
    const existing = await urlRepository.findById(id);
    if (!existing) {
      throw new NotFoundError("URL not found");
    }

    if (existing.userId !== userId) {
      throw new ForbiddenError("You do not have permission to delete this URL");
    }

    await urlRepository.delete(id, userId);

    // Invalidate cache
    await redis.del(`cache:url:${existing.shortCode}`);
    if (existing.customAlias) {
      await redis.del(`cache:url:${existing.customAlias}`);
    }
  },

  /**
   * Generate QR Code for a short URL
   */
  async generateQrCode(id, format = "png") {
    const url = await urlRepository.findById(id);
    if (!url) {
      throw new NotFoundError("URL not found");
    }

    const targetUrl = `${env.BASE_URL}/${url.customAlias || url.shortCode}`;

    if (format === "svg") {
      const svg = await QRCode.toString(targetUrl, {
        type: "svg",
        margin: 2,
        width: 300,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });
      return { contentType: "image/svg+xml", data: svg };
    }

    // Default: DataURL (Base64 PNG)
    const dataUrl = await QRCode.toDataURL(targetUrl, {
      margin: 2,
      width: 300,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    });

    return { contentType: "application/json", dataUrl, shortUrl: targetUrl };
  },
};
