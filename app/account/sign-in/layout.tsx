import type { Metadata } from 'next';

// The attendee sign-in page is a Client Component; its metadata lives here.
export const metadata: Metadata = { title: 'Sign in' };

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
