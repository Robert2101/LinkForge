import net from "node:net";
import { z } from "zod";
import { env } from "../../config/env.js";
import { RESERVED_CODES, SHORT_CODE_PATTERN } from "./shortCode.js";

// Addresses that only exist inside a private network. A public shortener must
// not hand out links to them: they are the usual target of phishing and of
// attacks on internal services (cloud metadata endpoints, routers, localhost).
const privateNetworks = new net.BlockList();
privateNetworks.addSubnet("0.0.0.0", 8);
privateNetworks.addSubnet("10.0.0.0", 8);
privateNetworks.addSubnet("100.64.0.0", 10);
privateNetworks.addSubnet("127.0.0.0", 8);
privateNetworks.addSubnet("169.254.0.0", 16); // includes 169.254.169.254, the cloud metadata address
privateNetworks.addSubnet("172.16.0.0", 12);
privateNetworks.addSubnet("192.168.0.0", 16);
privateNetworks.addSubnet("::", 127, "ipv6"); // :: and ::1
privateNetworks.addSubnet("fc00::", 7, "ipv6");
privateNetworks.addSubnet("fe80::", 10, "ipv6");

const PRIVATE_HOSTNAME = /(^|\.)(localhost|local|internal|lan|home|test|invalid)$/;
const OWN_HOST = new URL(env.BASE_URL).host;

export function isPublicHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  // "https://google.com@evil.example" really goes to evil.example: everything
  // before the @ is a username. It is a classic phishing trick, so refuse it.
  if (url.username || url.password) return false;

  // Shortening one of our own short links would create a redirect loop.
  if (url.host === OWN_HOST) return false;

  const hostname = url.hostname.replace(/^\[|\]$/g, ""); // IPv6 comes wrapped in [brackets]
  const ipVersion = net.isIP(hostname);
  if (ipVersion !== 0) return !privateNetworks.check(hostname, ipVersion === 6 ? "ipv6" : "ipv4");

  // A real public hostname has a dot ("example.com"), a private one usually does not.
  return hostname.includes(".") && !PRIVATE_HOSTNAME.test(hostname);
}

const destination = z
  .string()
  .trim()
  .min(1, "Enter a URL")
  .max(2048, "URL is too long (2048 characters at most)")
  .refine(isPublicHttpUrl, "Enter a public http:// or https:// address")
  // Store the parser's cleaned-up form (no stray whitespace or control
  // characters, punycode host), so what we redirect to is exactly what was checked.
  .transform((value) => new URL(value).href);

const futureDate = z.iso
  .datetime({ offset: true, message: "Use an ISO 8601 date and time" })
  .refine((value) => new Date(value) > new Date(), "Choose a time in the future");

export const createLinkBody = z.object({
  originalUrl: destination,
  customAlias: z
    .string()
    .trim()
    .min(3, "Use at least 3 characters")
    .max(30, "Use at most 30 characters")
    .regex(SHORT_CODE_PATTERN, "Use only letters, numbers, hyphens and underscores")
    .refine((alias) => !RESERVED_CODES.has(alias.toLowerCase()), "This name is reserved. Choose another.")
    .optional(),
  expiresAt: futureDate.optional(),
});

export const updateLinkBody = z
  .object({
    originalUrl: destination,
    isActive: z.boolean(),
    expiresAt: futureDate.nullable(), // null removes the expiry
  })
  .partial()
  .refine((fields) => Object.keys(fields).length > 0, "Send at least one field to change");

export const linkIdParams = z.object({
  id: z.uuid("Link id is not valid"),
});

export const listLinksQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

export const qrQuery = z.object({
  format: z.enum(["svg", "png"]).default("svg"),
});
