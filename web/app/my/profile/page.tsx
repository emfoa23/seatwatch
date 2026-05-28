import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users, oauthAccounts } from '@/lib/db/schema';
import { ProfileClient } from './ProfileClient';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = (await auth())!;
  const u = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  const accounts = await db.query.oauthAccounts.findMany({ where: eq(oauthAccounts.userId, session.user.id) });
  return (
    <ProfileClient
      email={u?.email ?? ''}
      displayName={u?.displayName ?? ''}
      hasPassword={!!u?.passwordHash}
      linkedProviders={accounts.map((a) => ({ id: a.id, provider: a.provider }))}
    />
  );
}
