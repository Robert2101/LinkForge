import { redis } from "../../lib/redis.js";
import { urlRepository } from "./url.repository.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { NotFoundError, ForbiddenError, GoneError } from "../../lib/errors.js";

const CACHE_TTL_SECONDS = 86400; // 24 hours
const NEGATIVE_CACHE_TTL = 60; // 1 minute

export const redirectController = {
  async redirect(req, res, next) {
    const { code } = req.params;

    // Ignore browser asset requests
    if (code === "favicon.ico" || code === "robots.txt") {
      return res.status(404).end();
    }

    try {
      const cacheKey = `cache:url:${code}`;

      // 1. Check Redis Cache
      const cached = await redis.get(cacheKey);

      if (cached) {
        if (cached === "__NOT_FOUND__") {
          return next(new NotFoundError("Short URL not found"));
        }

        try {
          const urlData = JSON.parse(cached);

          // Check if deactivated
          if (!urlData.isActive) {
            return next(
              new ForbiddenError("This short link has been paused or deactivated by its owner")
            );
          }

          // Check if expired
          if (urlData.expiresAt && new Date() > new Date(urlData.expiresAt)) {
            return next(new GoneError("This short link has expired"));
          }

          // Trigger asynchronous click analytics without blocking redirect
          analyticsService.recordClickAsync(urlData.id, req);

          // Return 302 Found
          res.set({
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          });
          return res.redirect(302, urlData.originalUrl);
        } catch {
          // If JSON parse fails, fall through to DB
        }
      }

      // 2. Cache Miss: Query PostgreSQL
      const record = await urlRepository.findByShortCode(code);

      if (!record) {
        // Negative caching to prevent cache penetration attacks
        await redis.set(cacheKey, "__NOT_FOUND__", "EX", NEGATIVE_CACHE_TTL);
        return next(new NotFoundError("Short URL not found"));
      }

      // Check active state
      if (!record.isActive) {
        return next(
          new ForbiddenError("This short link has been paused or deactivated by its owner")
        );
      }

      // Check expiration
      if (record.expiresAt && new Date() > new Date(record.expiresAt)) {
        return next(new GoneError("This short link has expired"));
      }

      // Populate Redis Cache
      const cachePayload = JSON.stringify({
        id: record.id,
        originalUrl: record.originalUrl,
        isActive: record.isActive,
        expiresAt: record.expiresAt,
      });

      await redis.set(cacheKey, cachePayload, "EX", CACHE_TTL_SECONDS);

      // Trigger asynchronous click analytics
      analyticsService.recordClickAsync(record.id, req);

      res.set({
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      });
      return res.redirect(302, record.originalUrl);
    } catch (error) {
      next(error);
    }
  },
};
