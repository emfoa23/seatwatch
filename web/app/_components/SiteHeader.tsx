import { auth, signOut } from '@/lib/auth';
import { SiteHeaderClient } from './SiteHeaderClient';

async function logoutAction() {
  'use server';
  await signOut({ redirectTo: '/' });
}

export async function SiteHeader() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;
  return <SiteHeaderClient loggedIn={loggedIn} logoutAction={logoutAction} />;
}
