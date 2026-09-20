import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import PostgresAdapter from "@auth/pg-adapter";
import type { Pool } from "pg";
import { getPool } from "./db";
import { googleEnabled } from "./auth-config";
import { hashPassword, needsRehash, verifyPassword } from "./password";
import { clientKey, rateLimit } from "./rate-limit";

export { OWNER_EMAIL, googleEnabled } from "./auth-config";

const lazyPool = {
  query: (...args: Parameters<Pool["query"]>) => getPool().query(...args),
} as unknown as Pool;

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PostgresAdapter(lazyPool),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID,
            clientSecret: process.env.AUTH_GOOGLE_SECRET,
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw, request) {
        const email = String(raw?.email ?? "").trim().toLowerCase();
        const password = String(raw?.password ?? "");
        if (!email || !password) return null;
        const limit = rateLimit(clientKey(request, `signin:${email}`), 10, 15 * 60_000);
        if (!limit.allowed) return null;
        const res = await getPool().query<{
          id: string; email: string | null; name: string | null;
          image: string | null; password_hash: string | null;
        }>(
          `SELECT id, email, name, image, password_hash FROM users WHERE lower(email) = $1`,
          [email],
        );
        const user = res.rows[0];
        const stored = user?.password_hash ?? "scrypt$00$" + "0".repeat(128);
        const ok = await verifyPassword(password, stored);
        if (!ok || !user?.password_hash) return null;
        if (needsRehash(user.password_hash)) {
          const upgraded = await hashPassword(password);
          await getPool().query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, upgraded]);
        }
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
