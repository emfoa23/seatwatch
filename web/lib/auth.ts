import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import Kakao from 'next-auth/providers/kakao';
import Naver from 'next-auth/providers/naver';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { cookies } from 'next/headers';
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

      const jar = await cookies();
      const linkUserId = jar.get('link_oauth_user_id')?.value;
      const allowSignup = jar.get('oauth_signup_allowed')?.value === '1';

      // 마이페이지 추가 연동 flow
      if (linkUserId) {
        if (linked) {
          jar.delete('link_oauth_user_id');
          if (linked.userId !== linkUserId) {
            // 이미 다른 계정에 연동된 OAuth
            return `/my/profile?error=oauth_taken&provider=${account.provider}`;
          }
          // 본인에 이미 연동돼있음 — 정상 로그인 + notice
          user.id = linked.userId;
          return `/my/profile?notice=already_linked&provider=${account.provider}`;
        }
        const sameEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (sameEmail && sameEmail.id !== linkUserId) {
          jar.delete('link_oauth_user_id');
          return `/my/profile?error=email_taken&provider=${account.provider}`;
        }
        await db.insert(oauthAccounts).values({
          userId: linkUserId,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });
        jar.delete('link_oauth_user_id');
        user.id = linkUserId;
        return `/my/profile?notice=linked&provider=${account.provider}`;
      }

      // 일반 로그인 flow — 이미 연동된 OAuth 면 그 계정으로 로그인
      if (linked) {
        user.id = linked.userId;
        return true;
      }

      // 같은 email 의 기존 user 자동 link (편의 — email 인증을 신뢰)
      const existingByEmail = await db.query.users.findFirst({ where: eq(users.email, email) });
      if (existingByEmail) {
        await db.insert(oauthAccounts).values({
          userId: existingByEmail.id,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        });
        user.id = existingByEmail.id;
        return true;
      }

      // 신규: 가입 허용 cookie 있어야 진행
      if (!allowSignup) {
        return `/login?error=signup_required&provider=${account.provider}`;
      }

      const [created] = await db
        .insert(users)
        .values({
          email,
          displayName: user.name ?? email.split('@')[0],
          emailVerifiedAt: new Date(),
        })
        .returning();
      await db.insert(slotInventory).values({ userId: created.id });
      await db.insert(oauthAccounts).values({
        userId: created.id,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      });
      jar.delete('oauth_signup_allowed');
      user.id = created.id;
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
