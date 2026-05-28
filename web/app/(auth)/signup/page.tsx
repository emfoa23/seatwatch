import Link from 'next/link';
import { redirect } from 'next/navigation';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users, slotInventory } from '@/lib/db/schema';
import { signIn } from '@/lib/auth';

const signupSchema = z.object({
  email: z.string().email('올바른 이메일을 입력하세요'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다').max(128),
  displayName: z.string().min(1).max(64).optional(),
});

async function signupAction(formData: FormData) {
  'use server';
  const parsed = signupSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName') || undefined,
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
      displayName: parsed.data.displayName ?? null,
    })
    .returning();
  await db.insert(slotInventory).values({ userId: created.id });

  await signIn('credentials', {
    email: parsed.data.email,
    password: parsed.data.password,
    redirectTo: '/my/watches',
  });
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
          닉네임 <span className="hint">(선택)</span>
          <input name="displayName" type="text" maxLength={64} />
        </label>
        <button type="submit" className="btn btn-primary">가입하기</button>
      </form>
      <p className="auth-footer">
        이미 계정이 있으신가요? <Link href="/login">로그인</Link>
      </p>
    </div>
  );
}
