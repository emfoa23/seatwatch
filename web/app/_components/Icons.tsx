import type { Site } from '@/lib/types/seat';

export function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.7 4.7-6.2 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.5 29.3 4.5 24 4.5 16.3 4.5 9.7 8.6 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5 0-9.4-3.2-11.1-7.8l-6.5 5C9.6 39.9 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42v-.5H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.2 5.2c-.4.4 6.7-4.9 6.7-14.4 0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function KakaoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#3C1E1E" d="M12 3C6.5 3 2 6.5 2 10.8c0 2.8 1.8 5.2 4.6 6.6-.2.7-.7 2.5-.8 2.9 0 0-.1.3.2.3.2 0 2.2-1.4 3.1-2 .9.1 1.9.2 2.9.2 5.5 0 10-3.5 10-7.8S17.5 3 12 3z" />
    </svg>
  );
}

export function NaverIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="3" fill="#03C75A" />
      <path fill="#fff" d="M16 7v10h-2.7l-3.6-5.3V17H7V7h2.7l3.6 5.3V7H16z" />
    </svg>
  );
}

const SITE_BRAND: Record<Site, { bg: string; fg: string; mark: string }> = {
  cgv: { bg: '#E51937', fg: '#fff', mark: 'CGV' },
  megabox: { bg: '#552583', fg: '#fff', mark: 'M' },
  lotte: { bg: '#ED1C24', fg: '#fff', mark: 'L' },
  interpark: { bg: '#FF6F00', fg: '#fff', mark: 'IP' },
  catchtable: { bg: '#1AB050', fg: '#fff', mark: 'CT' },
};

export function SiteLogo({ site, size = 22 }: { site: Site; size?: number }) {
  const b = SITE_BRAND[site];
  return (
    <span
      className="site-logo"
      style={{
        background: b.bg,
        color: b.fg,
        width: size,
        height: size,
        fontSize: Math.max(9, Math.floor(size * 0.42)),
      }}
      aria-hidden="true"
    >
      {b.mark}
    </span>
  );
}
