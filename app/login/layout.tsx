import type { Metadata } from 'next';

// The login page is a Client Component; its metadata lives here.
export const metadata: Metadata = { title: 'Log in' };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
