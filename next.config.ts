import type { NextConfig } from "next";

const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",          // report-only: records violations without breaking inline scripts (nonce boundary deferred to enforcement cutover, Sprint 3/4)
  // fonts.googleapis.com: app/layout.tsx's Material Symbols <link> stylesheet
  // (next/font/google's Geist/Geist_Mono are self-hosted at build time and
  // don't need this — only the plain <link>-tag icon font does).
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",  // font files the googleapis stylesheet references
  "img-src 'self' data: blob: https:",
  // nominatim.openstreetmap.org: lib/nominatim.ts's client-side venue-search fetch.
  "connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "report-uri /api/security/csp-report",
].join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
        { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
      ],
    }];
  },
};
export default nextConfig;
