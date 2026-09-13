import crypto from "node:crypto";
import { UAParser } from "ua-parser-js";
import { analyticsRepository } from "./analytics.repository.js";
import { urlRepository } from "../urls/url.repository.js";
import { NotFoundError, ForbiddenError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

const IP_SALT = "linkforge-ip-anonymization-salt-2026";

function anonymizeIp(ip) {
  if (!ip) return null;
  return crypto
    .createHash("sha256")
    .update(ip + IP_SALT)
    .digest("hex")
    .slice(0, 16);
}

function parseReferrer(rawReferrer) {
  if (!rawReferrer) return "Direct";
  try {
    const url = new URL(rawReferrer);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return rawReferrer.slice(0, 100);
  }
}

export const analyticsService = {
  /**
   * Asynchronously record a click without blocking the redirect response
   */
  recordClickAsync(urlId, req) {
    // Fire and forget using setImmediate
    setImmediate(async () => {
      try {
        const rawIp =
          req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
          req.ip ||
          req.connection?.remoteAddress ||
          "";
        const ipHash = anonymizeIp(rawIp);

        const userAgentString = req.headers["user-agent"] || "";
        const parser = new UAParser(userAgentString);
        const parsedUa = parser.getResult();

        const browser = parsedUa.browser.name || "Unknown";
        const os = parsedUa.os.name || "Unknown";
        const deviceType = parsedUa.device.type;
        const device =
          deviceType === "mobile"
            ? "Mobile"
            : deviceType === "tablet"
            ? "Tablet"
            : "Desktop";

        const rawReferrer = req.headers["referer"] || req.headers["referrer"];
        const referrer = parseReferrer(rawReferrer);

        await analyticsRepository.recordClick({
          urlId,
          ipHash,
          userAgent: userAgentString.slice(0, 500),
          browser,
          os,
          device,
          referrer,
          country: req.headers["cf-ipcountry"] || null, // Cloudflare / ALB geolocation header
        });
      } catch (err) {
        logger.error({ urlId, err: err.message }, "Background analytics logging failed");
      }
    });
  },

  /**
   * Ensure user owns the URL before returning analytics
   */
  async verifyOwnership(urlId, userId) {
    const url = await urlRepository.findById(urlId);
    if (!url) {
      throw new NotFoundError("URL not found");
    }
    if (userId && url.userId && url.userId !== userId) {
      throw new ForbiddenError("You do not have permission to view analytics for this URL");
    }
    return url;
  },

  async getSummary(urlId, userId) {
    const url = await this.verifyOwnership(urlId, userId);
    const summary = await analyticsRepository.getSummary(urlId);
    return { url, summary };
  },

  async getTimeSeries(urlId, userId, days = 14) {
    await this.verifyOwnership(urlId, userId);
    return await analyticsRepository.getTimeSeries(urlId, days);
  },

  async getBreakdown(urlId, userId) {
    await this.verifyOwnership(urlId, userId);
    return await analyticsRepository.getBreakdown(urlId);
  },

  async getUserDashboardOverview(userId) {
    return await analyticsRepository.getUserDashboardOverview(userId);
  },
};
