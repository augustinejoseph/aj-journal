import "./scripts/load-config.mjs";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowed } from "./lib/access";
import { db } from "./lib/db";
import { users, entries } from "./lib/schema";
import { isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ profile, user }) {
      const permitted =
        profile?.email_verified === true &&
        allowed(user.email, process.env.ALLOWED_EMAIL);
      if (!permitted) return false;
      const email = user.email!.trim().toLowerCase();
      const id = createHash("sha256").update(email).digest("hex");
      const database = db();
      const details = {
        email,
        googleId: typeof profile?.sub === "string" ? profile.sub : null,
        name: user.name ?? null,
        image: user.image ?? null,
      };
      await database
        .insert(users)
        .values({ id, ...details })
        .onConflictDoUpdate({ target: users.id, set: details });
      // This diary allows one owner; claim entries created before users existed.
      await database
        .update(entries)
        .set({ userId: id })
        .where(isNull(entries.userId));
      return true;
    },
    session({ session }) {
      return session;
    },
  },
});
