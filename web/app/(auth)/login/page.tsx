import { signIn } from '@/lib/auth';
import Link from 'next/link';
import { GoogleIcon, KakaoIcon, NaverIcon } from '@/app/_components/Icons';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? '/my/watches';

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
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="auth-card">
      <h1>로그인</h1>
      {params.error && <p className="auth-error">로그인 실패: {params.error}</p>}

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
