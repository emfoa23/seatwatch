import { signIn } from '@/lib/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, oauthAccounts } from '@/lib/db/schema';
import { GoogleIcon, KakaoIcon, NaverIcon } from '@/app/_components/Icons';

const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

function describeOauthOnly(providers?: string): string {
  const provs = (providers ?? '').split(',').filter(Boolean).map((p) => PROVIDER_LABEL[p] ?? p);
  if (provs.length === 0) return '이 계정은 OAuth 로 가입되어 있어 이메일 비밀번호 로그인이 불가능합니다.';
  return `이 계정은 ${provs.join(' · ')} 로 가입되어 있어요. 위의 OAuth 버튼으로 로그인해주세요. (비밀번호를 새로 만들고 싶다면 OAuth 로 로그인 후 마이페이지 → 프로필 편집에서 설정)`;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    callbackUrl?: string;
    provider?: string;
    providers?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? '/my/watches';
  const signupRequired = params.error === 'signup_required';
  const oauthOnly = params.error === 'oauth_only';
  const invalidCreds = params.error === 'invalid_credentials';

  async function oauthGoogle() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }
  async function oauthKakao() {
    'use server';
    await signIn('kakao', { redirectTo: callbackUrl });
  }
  async function oauthNaver() {
    'use server';
    await signIn('naver', { redirectTo: callbackUrl });
  }
  async function credentialsAction(formData: FormData) {
    'use server';
    const email = formData.get('email')?.toString().trim();
    const password = formData.get('password')?.toString() ?? '';
    if (!email || !password) {
      redirect('/login?error=invalid_credentials');
    }
    // 사전 검사: OAuth-only 계정?
    const u = await db.query.users.findFirst({ where: eq(users.email, email!) });
    if (u && !u.passwordHash) {
      const accounts = await db.query.oauthAccounts.findMany({
        where: eq(oauthAccounts.userId, u.id),
      });
      const providers = accounts.map((a) => a.provider).join(',');
      redirect(`/login?error=oauth_only&providers=${providers}`);
    }
    await signIn('credentials', {
      email,
      password,
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="auth-card">
      <h1>로그인</h1>
      {signupRequired && (
        <div className="auth-info">
          <strong>등록되지 않은 {params.provider ?? 'OAuth'} 계정입니다.</strong>
          <p>아직 가입하지 않으셨다면 회원가입 페이지에서 진행해주세요.</p>
          <Link href="/signup" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>회원가입으로 이동</Link>
        </div>
      )}
      {oauthOnly && (
        <div className="auth-info">
          <strong>이메일 비밀번호 로그인이 불가능한 계정입니다.</strong>
          <p style={{ marginTop: 4 }}>{describeOauthOnly(params.providers)}</p>
        </div>
      )}
      {invalidCreds && <p className="auth-error">이메일 또는 비밀번호가 일치하지 않습니다.</p>}

      <div className="oauth-buttons">
        <form action={oauthGoogle}>
          <button type="submit" className="btn btn-google">
            <GoogleIcon /> <span>Google 로 계속</span>
          </button>
        </form>
        <form action={oauthKakao}>
          <button type="submit" className="btn btn-kakao">
            <KakaoIcon /> <span>카카오로 계속</span>
          </button>
        </form>
        <form action={oauthNaver}>
          <button type="submit" className="btn btn-naver">
            <NaverIcon /> <span>네이버로 계속</span>
          </button>
        </form>
      </div>

      <div className="divider">또는</div>

      <form action={credentialsAction} className="cred-form">
        <label>
          이메일
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          비밀번호
          <input name="password" type="password" required minLength={8} autoComplete="current-password" />
        </label>
        <button type="submit" className="btn btn-primary">로그인</button>
      </form>

      <p className="auth-footer">
        계정이 없으신가요? <Link href="/signup">회원가입</Link>
      </p>
    </div>
  );
}
