// Client-safe group key codec. (Valkey 의존성 없음)
export function encodeGroupKey(key: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(key, 'utf-8').toString('base64url');
  }
  // browser fallback — utf-8 → base64url
  const bytes = new TextEncoder().encode(key);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeGroupKey(encoded: string): string {
  if (typeof window === 'undefined') {
    return Buffer.from(encoded, 'base64url').toString('utf-8');
  }
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(padded + '==='.slice((padded.length + 3) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
