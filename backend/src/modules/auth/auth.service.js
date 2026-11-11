import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { conflict, notFound, unauthorized } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import { authRepository } from "./auth.repository.js";

// How sign-in works
// -----------------
// A session is two tokens:
//
//   ACCESS TOKEN   A signed JWT that lives for 15 minutes. The browser keeps it
//                  in memory and sends it with every API call. The server
//                  verifies the signature and needs no database lookup.
//
//   REFRESH TOKEN  A long random string that lives for 7 days in an httpOnly
//                  cookie, which JavaScript cannot read. Its only use is to
//                  obtain a new access token. The database stores a hash of
//                  it, never the token itself.
//
// Every refresh token works exactly once: using it returns a replacement
// ("rotation"). If a used token ever shows up again, either the user or a
// thief is holding a stolen copy, so every token from that login is revoked.

// Argon2id with the parameters OWASP recommends (19 MiB memory, 2 passes).
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };

// A token replayed within this window is treated as a duplicate request
// (double click, network retry), not as theft.
const REPLAY_GRACE_MS = 10_000;

const REFRESH_TOKEN_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: `${env.ACCESS_TOKEN_TTL_MINUTES}m`,
  });
}

// Issues both tokens. A fresh login starts a new token family; a refresh
// passes its existing family along.
async function startSession(user, familyId = crypto.randomUUID()) {
  const refreshToken = crypto.randomBytes(32).toString("base64url");

  await authRepository.saveRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { user, accessToken: signAccessToken(user.id), refreshToken };
}

// Verifying a password takes ~50ms on purpose. If we skipped that work for
// unknown emails, response time would reveal which emails have accounts.
// So unknown emails are checked against this throwaway hash instead.
let fakePasswordHash;
async function verifyPassword(user, password) {
  fakePasswordHash ??= argon2.hash("not-a-real-password", ARGON2_OPTIONS);
  const hash = user?.passwordHash ?? (await fakePasswordHash);
  const matches = await argon2.verify(hash, password);
  return Boolean(user) && matches;
}

export const authService = {
  refreshTokenTtlMs: REFRESH_TOKEN_TTL_MS,

  async register({ email, password, name }) {
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    const user = await authRepository.createUser({ email, passwordHash, name: name ?? null });
    if (!user) throw conflict("An account with this email already exists. Sign in instead.");
    return startSession(user);
  },

  async login({ email, password }) {
    const account = await authRepository.findUserWithPasswordByEmail(email);
    if (!(await verifyPassword(account, password))) {
      // Same message for "no such email" and "wrong password".
      throw unauthorized("Email or password is incorrect");
    }

    await authRepository.deleteExpiredTokens(account.id);

    const { id, name, createdAt } = account;
    return startSession({ id, email: account.email, name, createdAt });
  },

  async refresh(refreshToken) {
    if (!refreshToken) throw unauthorized();
    const tokenHash = hashToken(refreshToken);

    const used = await authRepository.useRefreshToken(tokenHash);
    if (used) {
      const user = await authRepository.findUserById(used.userId);
      if (!user) throw unauthorized();
      return startSession(user, used.familyId);
    }

    // The token was not usable. Work out whether that is suspicious.
    const existing = await authRepository.findRefreshToken(tokenHash);
    const wasUsedEarlier =
      existing?.revokedAt && Date.now() - existing.revokedAt.getTime() > REPLAY_GRACE_MS;

    if (wasUsedEarlier) {
      logger.warn({ userId: existing.userId }, "Refresh token reuse detected, revoking the session family");
      await authRepository.revokeTokenFamily(existing.familyId);
    }
    throw unauthorized("Session expired. Sign in again.");
  },

  async logout(refreshToken) {
    if (!refreshToken) return;
    await authRepository.useRefreshToken(hashToken(refreshToken));
  },

  async getUser(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw notFound("Account not found");
    return user;
  },
};
