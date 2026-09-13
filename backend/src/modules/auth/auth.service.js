import crypto from "node:crypto";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { authRepository } from "./auth.repository.js";
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

// Helper to hash refresh tokens with SHA-256 before DB persistence
function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export const authService = {
  /**
   * Register a new user with Argon2id password hashing
   */
  async register({ email, password, name }) {
    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
      throw new ConflictError("A user with this email address already exists");
    }

    // Hash password with Argon2id using OWASP recommendations
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456, // 19 MiB
      timeCost: 2,
      parallelism: 1,
    });

    const user = await authRepository.createUser({
      email,
      passwordHash,
      name: name || null,
    });

    // Generate initial token pair and token family
    const familyId = crypto.randomUUID();
    const { accessToken, refreshToken, expiresAt } = await this.issueTokenPair(
      user.id,
      familyId
    );

    return { user, accessToken, refreshToken, expiresAt };
  },

  /**
   * Authenticate user with email and password
   */
  async login({ email, password }) {
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const isValid = await argon2.verify(user.passwordHash, password);
    if (!isValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // New login spawns a fresh token family
    const familyId = crypto.randomUUID();
    const { accessToken, refreshToken, expiresAt } = await this.issueTokenPair(
      user.id,
      familyId
    );

    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };

    return { user: safeUser, accessToken, refreshToken, expiresAt };
  },

  /**
   * Refresh Token Rotation with Token Family Reuse Detection
   */
  async refresh(rawRefreshToken) {
    if (!rawRefreshToken) {
      throw new UnauthorizedError("Refresh token is required");
    }

    // Verify JWT cryptographic signature
    let decoded;
    try {
      decoded = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
    } catch (err) {
      throw new UnauthorizedError("Invalid or expired refresh token");
    }

    const tokenHash = hashToken(rawRefreshToken);
    const tokenRecord = await authRepository.findRefreshTokenByHash(tokenHash);

    // If record not found, reject
    if (!tokenRecord) {
      throw new UnauthorizedError("Invalid refresh session");
    }

    // BREACH DETECTION: If token was already revoked, someone is trying to reuse a spent token!
    if (tokenRecord.isRevoked) {
      logger.warn(
        { userId: tokenRecord.userId, familyId: tokenRecord.familyId },
        "🚨 Refresh token reuse detected! Revoking token family."
      );
      // Immediately revoke all tokens in the entire family
      await authRepository.revokeAllTokensInFamily(tokenRecord.familyId);
      throw new UnauthorizedError(
        "Security violation: Token reuse detected. Please log in again."
      );
    }

    // Check expiration
    if (new Date() > new Date(tokenRecord.expiresAt)) {
      await authRepository.revokeRefreshToken(tokenRecord.id);
      throw new UnauthorizedError("Refresh session expired");
    }

    // Invalidate the current token
    await authRepository.revokeRefreshToken(tokenRecord.id);

    // Issue new pair maintaining the SAME family ID
    const { accessToken, refreshToken: newRefreshToken, expiresAt } =
      await this.issueTokenPair(tokenRecord.userId, tokenRecord.familyId);

    return { accessToken, refreshToken: newRefreshToken, expiresAt };
  },

  /**
   * Logout: Revoke the active refresh token
   */
  async logout(rawRefreshToken) {
    if (rawRefreshToken) {
      const tokenHash = hashToken(rawRefreshToken);
      const tokenRecord = await authRepository.findRefreshTokenByHash(tokenHash);
      if (tokenRecord) {
        await authRepository.revokeRefreshToken(tokenRecord.id);
      }
    }
  },

  /**
   * Get user profile by ID
   */
  async getMe(userId) {
    const user = await authRepository.findUserById(userId);
    if (!user) {
      throw new NotFoundError("User not found");
    }
    return user;
  },

  /**
   * Helper to issue access & refresh tokens
   */
  async issueTokenPair(userId, familyId) {
    const accessToken = jwt.sign(
      { sub: userId },
      env.JWT_ACCESS_SECRET,
      { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
    );

    const refreshToken = jwt.sign(
      { sub: userId, familyId },
      env.JWT_REFRESH_SECRET,
      { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
    );

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const tokenHash = hashToken(refreshToken);

    await authRepository.createRefreshToken({
      userId,
      tokenHash,
      familyId,
      expiresAt,
    });

    return { accessToken, refreshToken, expiresAt };
  },
};
