'use server';

import { eq } from 'drizzle-orm';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { auth, signIn } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, oauthAccounts } from '@/lib/db/schema';

const nameSchema = z.string().trim().min(2).max(32);
const pwSchema = z.string().min(8).max(128);

export async function updateNicknameAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  const parsed = nameSchema.safeParse(formData.get('displayName'));
  if (!parsed.success) return { ok: false, error: '닉네임은 2-32자입니다.' };
  await db.update(users).set({ displayName: parsed.data }).where(eq(users.id, session.user.id));
  revalidatePath('/my');
  revalidatePath('/my/profile');
  return { ok: true };
}

export async function setPasswordAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  const current = formData.get('current')?.toString();
  const next = formData.get('next')?.toString();
  const parsed = pwSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: '비밀번호는 8자 이상' };

  const u = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!u) return { ok: false, error: 'user_not_found' };

  if (u.passwordHash) {
    if (!current) return { ok: false, error: '현재 비밀번호가 필요합니다.' };
    const ok = await compare(current, u.passwordHash);
    if (!ok) return { ok: false, error: '현재 비밀번호가 일치하지 않습니다.' };
  }
  const newHash = await hash(parsed.data, 10);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, session.user.id));
  revalidatePath('/my/profile');
  return { ok: true };
}

export async function linkOauthAction(formData: FormData): Promise<never> {
  const provider = formData.get('provider')?.toString();
  if (!provider || !['google', 'kakao', 'naver'].includes(provider)) {
    throw new Error('invalid_provider');
  }
  const session = await auth();
  if (!session?.user?.id) throw new Error('unauthorized');
  const jar = await cookies();
  jar.set('link_oauth_user_id', session.user.id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
  await signIn(provider, { redirectTo: '/my/profile' });
  throw new Error('unreachable');
}

export async function unlinkOauthAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: 'unauthorized' };
  const id = formData.get('id')?.toString();
  if (!id) return { ok: false, error: 'invalid' };
  // 마지막 인증수단 보호: passwordHash 없고 OAuth 1개면 해제 차단
  const u = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  const accounts = await db.query.oauthAccounts.findMany({ where: eq(oauthAccounts.userId, session.user.id) });
  if (!u?.passwordHash && accounts.length <= 1) {
    return { ok: false, error: '비밀번호 미설정 + OAuth 1개 상태에서는 해제할 수 없습니다. 먼저 비밀번호를 설정하세요.' };
  }
  await db.delete(oauthAccounts).where(eq(oauthAccounts.id, id));
  revalidatePath('/my/profile');
  return { ok: true };
}
