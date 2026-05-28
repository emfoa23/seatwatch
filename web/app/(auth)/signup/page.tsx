import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { users, slotInventory } from '@/lib/db/schema';
import { signIn } from '@/lib/auth';
import { GoogleIcon, KakaoIcon, NaverIcon } from '@/app/_components/Icons';

const signupSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다').max(128),
  displayName: z.string().min(2, '닉네임은 2자 이상이어야 합니다').max(32),
});

async function signupAction(formData: FormData) {
  'use server';
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join(', ');
    redirect(`/signup?error=${encodeURIComponent(msg)}`);
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (existing) redirect('/signup?error=already_exists');

  const passwordHash = await hash(parsed.data.password, 10);
  const [created] = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      passwordHash,
      displayName: parsed.data.displayName,
    })
    .returning();
  await db.insert(slotInventory).values({ userId: created.id });

  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/my/watches',
  });
}

async function oauthSignupAction(formData: FormData) {
  'use server';
  const provider = formData.get('provider')?.toString();
  if (!provider || !['google', 'kakao', 'naver'].includes(provider)) return;
  const jar = await cookies();
  jar.set('oauth_signup_allowed', '1', { httpOnly: true, sameSite: 'lax', maxAge: 300, path: '/' });
  await signIn(provider, { redirectTo: '/my/watches' });
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const err = params.error;
  const errMsg =
    err === 'already_exists'
      ? '이미 가입된 이메일입니다'
      : err
        ? decodeURIComponent(err)
        : null;

  return (
    <div className="auth-card">
      <h1>회원가입</h1>
      {errMsg && <p className="auth-error">{errMsg}</p>}
      <form action={signupAction} className="cred-form">
        <label>
          이메일
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          비밀번호 <span className="hint">(8자 이상)</span>
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label>
          닉네임 <span className="hint">(2-32자, 필수)</span>
          <input name="displayName" type="text" required minLength={2} maxLength={32} />
        </label>
        <button type="submit" className="btn btn-primary">가입하기</button>
      </form>
      <div className="divider">또는</div>

      <div className="oauth-buttons">
        <form action={oauthSignupAction}>
          <input type="hidden" name="provider" value="google" />
          <button type="submit" className="btn btn-google"><GoogleIcon /> <span>Google 로 가입</span></button>
        </form>
        <form action={oauthSignupAction}>
          <input type="hidden" name="provider" value="kakao" />
          <button type="submit" className="btn btn-kakao"><KakaoIcon /> <span>카카오로 가입</span></button>
        </form>
        <form action={oauthSignupAction}>
          <input type="hidden" name="provider" value="naver" />
          <button type="submit" className="btn btn-naver"><NaverIcon /> <span>네이버로 가입</span></button>
        </form>
      </div>

      <p className="auth-footer">
        이미 계정이 있으신가요? <Link href="/login">로그인</Link>
      </p>
    </div>
  );
}
