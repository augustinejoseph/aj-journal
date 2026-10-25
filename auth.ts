import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { allowed } from "./lib/access";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile, user }) {
      return (
        profile?.email_verified === true &&
        allowed(user.email, process.env.ALLOWED_EMAIL)
      );
    },
    session({ session }) {
      return session;
    },
  },
});
