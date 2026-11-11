import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, refreshTokens } from "../../db/schema.js";

// All SQL for accounts and sessions lives here.

// The columns that are safe to send to the browser (never the password hash).
const publicUser = {
  id: users.id,
  email: users.email,
  name: users.name,
  createdAt: users.createdAt,
};

export const authRepository = {
  // Returns the new user, or null when the email is already registered.
  // The UNIQUE constraint decides, so two simultaneous sign-ups cannot both win.
  async createUser({ email, passwordHash, name }) {
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name })
      .onConflictDoNothing({ target: users.email })
      .returning(publicUser);
    return user ?? null;
  },

  // Includes the password hash; used only to verify a login.
  async findUserWithPasswordByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user ?? null;
  },

  async findUserById(id) {
    const [user] = await db.select(publicUser).from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
  },

  async saveRefreshToken({ userId, tokenHash, familyId, expiresAt }) {
    await db.insert(refreshTokens).values({ userId, tokenHash, familyId, expiresAt });
  },

  // Marks a token as used and returns it, but only if it is still valid.
  // Doing the check and the update in ONE statement means that when two
  // requests present the same token at once, exactly one of them gets it.
  async useRefreshToken(tokenHash) {
    const [token] = await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .returning();
    return token ?? null;
  },

  async findRefreshToken(tokenHash) {
    const [token] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return token ?? null;
  },

  async revokeTokenFamily(familyId) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  },

  async deleteExpiredTokens(userId) {
    await db
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), lt(refreshTokens.expiresAt, new Date())));
  },
};
