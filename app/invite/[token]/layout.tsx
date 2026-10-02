import type { Metadata } from 'next';

// The invite page is a Client Component; its metadata lives here. A tab titled
// just "Eventar" gave nobody a way to tell this page from any other.
export const metadata: Metadata = { title: 'Join your team' };

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
