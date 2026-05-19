import { redirect } from 'next/navigation';

// Root sends every visitor to the dashboard. The proxy then bounces
// unauthenticated visitors to /login per its matcher in proxy.ts.
// (The Phase 1 scaffold create-next-app landing page is gone.)
export default function RootRedirect() {
  redirect('/dashboard');
}
