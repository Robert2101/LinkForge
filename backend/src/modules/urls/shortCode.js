import crypto from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"; // 62 characters

// What a short code may look like: generated codes and custom aliases alike.
// The redirect route rejects anything else before touching Redis or Postgres.
export const SHORT_CODE_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

// Paths the web app and API use themselves. A link may not take these names.
export const RESERVED_CODES = new Set([
  "api", "health", "assets", "static", "qr",
  "login", "register", "logout", "dashboard", "links", "settings", "account",
  "admin", "docs", "about", "help", "status", "terms", "privacy",
]);

// Returns a random code such as "aZ3kP0q".
//
// 7 characters from a 62-letter alphabet give 62^7 = 3.5 trillion codes, and
// crypto.randomBytes makes them unguessable (a counter would let anyone walk
// through every link ever created).
//
// A random byte is 0..255, and 256 is not a multiple of 62, so `byte % 62`
// would make the first 8 characters slightly more likely. Bytes of 248 and
// above are thrown away (248 = 62 * 4), which keeps every character equally likely.
export function generateShortCode(length = 7) {
  let code = "";
  while (code.length < length) {
    for (const byte of crypto.randomBytes(length * 2)) {
      if (byte < 248 && code.length < length) code += ALPHABET[byte % 62];
    }
  }
  return code;
}
