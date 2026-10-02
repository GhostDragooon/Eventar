import type { Metadata } from 'next';

// The attendee sign-up page is a Client Component; its metadata lives here.
export const metadata: Metadata = { title: 'Create your record' };

export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return children;
}
