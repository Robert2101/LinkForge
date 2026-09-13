import crypto from "node:crypto";

const BASE62_CHARSET =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARSET_LENGTH = BASE62_CHARSET.length; // 62

/**
 * Generates a cryptographically secure random Base62 short code.
 *
 * Entropy Calculation:
 * For length 7, 62^7 = 3,521,614,606,208 (3.52 Trillion permutations).
 * Using crypto.randomBytes avoids modulo bias by discarding values >= 248
 * (248 is the largest multiple of 62 less than 256: 62 * 4 = 248).
 *
 * @param {number} length - Length of short code (default 7)
 * @returns {string} - Random Base62 string
 */
export function generateShortCode(length = 7) {
  let result = "";
  while (result.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && result.length < length; i++) {
      const byte = bytes[i];
      // Rejection sampling to prevent modulo bias:
      // 256 % 62 = 8, so bytes from 248..255 are discarded
      if (byte < 248) {
        result += BASE62_CHARSET[byte % CHARSET_LENGTH];
      }
    }
  }
  return result;
}
