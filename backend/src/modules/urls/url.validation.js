import { z } from "zod";

const RESERVED_ALIASES = new Set([
  "api",
  "health",
  "auth",
  "urls",
  "analytics",
  "dashboard",
  "admin",
  "docs",
  "static",
  "favicon.ico",
  "robots.txt",
  "me",
  "login",
  "register",
  "status",
]);

// Helper to check SSRF / internal address targets
function isSafeUrl(urlStr) {
  try {
    const parsed = new URL(urlStr);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Loopback, cloud metadata, and link-local ranges
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname === "169.254.169.254" // AWS EC2 / ECS metadata IP
    ) {
      return false;
    }

    // Private IPv4 ranges (RFC 1918)
    if (
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export const createUrlSchema = z.object({
  body: z.object({
    originalUrl: z
      .string()
      .trim()
      .url("Must be a valid URL starting with http:// or https://")
      .max(2048, "URL is too long (max 2048 characters)")
      .refine(isSafeUrl, "Cannot shorten internal, loopback, or metadata addresses (SSRF protection)"),
    customAlias: z
      .string()
      .trim()
      .min(3, "Custom alias must be at least 3 characters")
      .max(30, "Custom alias cannot exceed 30 characters")
      .regex(
        /^[a-zA-Z0-9_-]+$/,
        "Custom alias may only contain letters, numbers, hyphens, and underscores"
      )
      .refine(
        (alias) => !RESERVED_ALIASES.has(alias.toLowerCase()),
        "This alias is a reserved system keyword and cannot be used"
      )
      .optional()
      .nullable(),
    expiresAt: z
      .string()
      .datetime({ message: "expiresAt must be a valid ISO 8601 date string" })
      .refine(
        (val) => new Date(val) > new Date(),
        "Expiration date must be in the future"
      )
      .optional()
      .nullable(),
  }),
});

export const updateUrlSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid URL ID format"),
  }),
  body: z.object({
    originalUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine(isSafeUrl, "Cannot target internal or metadata addresses")
      .optional(),
    isActive: z.boolean().optional(),
    expiresAt: z
      .string()
      .datetime()
      .refine(
        (val) => new Date(val) > new Date(),
        "Expiration date must be in the future"
      )
      .optional()
      .nullable(),
  }),
});

export const urlIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid("Invalid URL ID format"),
  }),
});

export const listUrlsQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().trim().optional(),
  }),
});
