import { eq, and } from "drizzle-orm";
import { db } from "../../lib/db.js";
import { users, refreshTokens } from "../../db/schema.js";

export const authRepository = {
  async createUser({ email, passwordHash, name }) {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      });
    return user;
  },

  async findUserByEmail(email) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user || null;
  },

  async findUserById(id) {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return user || null;
  },

  async createRefreshToken({ userId, tokenHash, familyId, expiresAt }) {
    const [token] = await db
      .insert(refreshTokens)
      .values({ userId, tokenHash, familyId, expiresAt })
      .returning();
    return token;
  },

  async findRefreshTokenByHash(tokenHash) {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return token || null;
  },

  async revokeRefreshToken(id) {
    await db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.id, id));
  },

  async revokeAllTokensInFamily(familyId) {
    await db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.familyId, familyId));
  },

  async revokeAllUserTokens(userId) {
    await db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));
  },
};
