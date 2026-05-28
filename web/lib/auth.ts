import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Kakao from 'next-auth/providers/kakao';
import Naver from 'next-auth/providers/naver';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { users, oauthAccounts, slotInventory } from './db/schema';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    Kakao({
      clientId: process.env.KAKAO_CLIENT_ID,
      clientSecret: process.env.KAKAO_CLIENT_SECRET,
    }),
    Naver({
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const u = await db.query.users.findFirst({
          where: eq(users.email, parsed.data.email),
        });
        if (!u?.passwordHash) return null;
        const ok = await compare(parsed.data.password, u.passwordHash);
        if (!ok) return null;
        return {
          id: u.id,
          email: u.email,
          name: u.displayName ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider === 'credentials') return true;

      const email = user.email;
      if (!email) return false;

      const linked = await db.query.oauthAccounts.findFirst({
        where: and(
          eq(oauthAccounts.provider, account.provider),
          eq(oauthAccounts.providerAccountId, account.providerAccountId)
        ),
      });
      if (linked) {
        user.id = linked.userId;
        return true;
      }

      let dbUser = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (!dbUser) {
        const [created] = await db
          .insert(users)
          .values({
            email,
            displayName: user.name ?? null,
            emailVerifiedAt: new Date(),
          })
          .returning();
        dbUser = created;
        await db.insert(slotInventory).values({ userId: dbUser.id });
      }

      await db.insert(oauthAccounts).values({
        userId: dbUser.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      });
      user.id = dbUser.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
});
