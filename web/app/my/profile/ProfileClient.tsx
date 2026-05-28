'use client';

import { useState, useTransition } from 'react';
import { updateNicknameAction, setPasswordAction, linkOauthAction, unlinkOauthAction } from './actions';

const ALL_PROVIDERS = ['google', 'kakao', 'naver'] as const;
const PROVIDER_LABEL: Record<string, string> = {
  google: 'Google',
  kakao: '카카오',
  naver: '네이버',
};

interface Linked {
  id: string;
  provider: string;
}

interface Banner {
  kind: 'ok' | 'err';
  code: string;
  provider?: string;
}

interface Props {
  email: string;
  displayName: string;
  hasPassword: boolean;
  linkedProviders: Linked[];
  banner: Banner | null;
}

const BANNER_MSG: Record<string, string> = {
  linked: '연동 완료.',
  already_linked: '이미 연결된 계정입니다.',
  oauth_taken: '이 OAuth 계정은 다른 seatwatch 계정에 이미 연결되어 있습니다.',
  email_taken: '같은 이메일을 사용하는 다른 계정이 이미 있습니다.',
};

export function ProfileClient({ email, displayName, hasPassword, linkedProviders, banner }: Props) {
  const [, startTransition] = useTransition();
  const [name, setName] = useState(displayName);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [linkMsg, setLinkMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const linkedSet = new Set(linkedProviders.map((l) => l.provider));
  const unlinkable = ALL_PROVIDERS.filter((p) => linkedSet.has(p));
  const linkable = ALL_PROVIDERS.filter((p) => !linkedSet.has(p));

  async function saveName(formData: FormData) {
    setNameMsg(null);
    const r = await updateNicknameAction(formData);
    setNameMsg(r.ok ? { ok: true, text: '닉네임이 변경됐습니다.' } : { ok: false, text: r.error ?? '실패' });
  }

  async function savePassword(formData: FormData) {
    setPwMsg(null);
    const r = await setPasswordAction(formData);
    setPwMsg(r.ok ? { ok: true, text: '비밀번호가 변경됐습니다.' } : { ok: false, text: r.error ?? '실패' });
  }

  async function unlink(id: string) {
    if (!confirm('이 OAuth 연결을 해제할까요?')) return;
    const fd = new FormData();
    fd.set('id', id);
    const r = await unlinkOauthAction(fd);
    setLinkMsg(r.ok ? { ok: true, text: '해제됐습니다.' } : { ok: false, text: r.error ?? '실패' });
    if (r.ok) startTransition(() => window.location.reload());
  }

  const bannerText = banner ? (BANNER_MSG[banner.code] ?? banner.code) + (banner.provider ? ` (${PROVIDER_LABEL[banner.provider] ?? banner.provider})` : '') : null;

  return (
    <div className="profile-page">
      <h1>프로필 편집</h1>
      {bannerText && (
        <p className={banner!.kind === 'ok' ? 'msg-ok profile-banner' : 'msg-err profile-banner'}>{bannerText}</p>
      )}

      <section className="profile-section">
        <h2>기본 정보</h2>
        <p className="dim small">이메일 (변경 불가): {email}</p>
        <form action={saveName} className="profile-form">
          <label>
            닉네임
            <input
              name="displayName"
              type="text"
              required
              minLength={2}
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">변경 저장</button>
          {nameMsg && <p className={nameMsg.ok ? 'msg-ok' : 'msg-err'}>{nameMsg.text}</p>}
        </form>
      </section>

      <section className="profile-section">
        <h2>비밀번호</h2>
        <p className="dim small">
          {hasPassword
            ? '비밀번호를 변경하려면 현재 비밀번호를 입력하세요.'
            : 'OAuth 로 가입했습니다. 비밀번호를 새로 설정하면 이메일 로그인도 가능합니다.'}
        </p>
        <form action={savePassword} className="profile-form">
          {hasPassword && (
            <label>
              현재 비밀번호
              <input name="current" type="password" required autoComplete="current-password" />
            </label>
          )}
          <label>
            새 비밀번호 <span className="hint">(8자 이상)</span>
            <input name="next" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button type="submit" className="btn btn-primary btn-sm">
            {hasPassword ? '비밀번호 변경' : '비밀번호 설정'}
          </button>
          {pwMsg && <p className={pwMsg.ok ? 'msg-ok' : 'msg-err'}>{pwMsg.text}</p>}
        </form>
      </section>

      <section className="profile-section">
        <h2>OAuth 연동</h2>
        {linkedProviders.length === 0 ? (
          <p className="dim small">연결된 OAuth 계정이 없습니다.</p>
        ) : (
          <ul className="oauth-linked-list">
            {unlinkable.map((p) => {
              const linked = linkedProviders.find((l) => l.provider === p)!;
              return (
                <li key={p}>
                  <span>{PROVIDER_LABEL[p]} · 연결됨</span>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => unlink(linked.id)}>해제</button>
                </li>
              );
            })}
          </ul>
        )}
        {linkable.length > 0 && (
          <div className="oauth-link-add">
            <p className="dim small" style={{ marginTop: 12 }}>추가 연동:</p>
            <div className="oauth-link-buttons">
              {linkable.map((p) => (
                <form key={p} action={linkOauthAction} style={{ display: 'inline' }}>
                  <input type="hidden" name="provider" value={p} />
                  <button type="submit" className="btn btn-secondary btn-sm">{PROVIDER_LABEL[p]} 연결</button>
                </form>
              ))}
            </div>
          </div>
        )}
        {linkMsg && <p className={linkMsg.ok ? 'msg-ok' : 'msg-err'}>{linkMsg.text}</p>}
      </section>
    </div>
  );
}
