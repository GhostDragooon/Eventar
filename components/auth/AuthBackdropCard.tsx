import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Auth page shell modelled on React Bits Pro **Auth 3**
 * (centered sign-in card over a full-bleed backdrop).
 *
 * Used by the organiser door (`/login`). Magic-link only for now.
 *
 * TODO(auth-backdrop): Replace the temporary gradient with the final brand /
 * photography backdrop (Auth 3 ships an image layer; keep the same cover +
 * center structure when the asset lands).
 *
 * TODO(auth-sso): When SSO is product-ready, render provider buttons under the
 * optional `footer` / divider slot (Google / Apple / GitHub as in Auth 3).
 * Do not invent providers before that decision.
 */
export function AuthBackdropCard({
  children,
  asideTitle = 'Eventar',
  asideBody = 'Organiser door — run events, check-in, and team access.',
}: {
  children: ReactNode;
  asideTitle?: string;
  asideBody?: string;
}) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden text-on-surface">
      {/* Backdrop — Auth 3 image layer. Temporary brand gradient until asset. */}
      <div className="absolute inset-0" aria-hidden>
        {/* TODO(auth-backdrop): <Image fill priority src={...} className="object-cover" /> */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 80% at 70% 40%, #0E79EC 0%, #1C3C94 45%, #0B1F4A 100%)',
          }}
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      <div className="relative z-[1] mx-auto flex min-h-dvh w-full max-w-6xl flex-col items-center justify-center gap-xl px-grid-margin py-xl lg:flex-row lg:items-center lg:justify-between lg:gap-2xl">
        {/* Card — Auth 3 centered panel */}
        <div className="w-full max-w-[400px] rounded-[20px] border border-white/10 bg-surface-container-lowest/95 p-lg shadow-lg backdrop-blur-sm dark:bg-surface-container-high/95">
          <div className="flex flex-col gap-lg">{children}</div>
        </div>

        {/* Side copy on large screens (Auth 3 places brand text on the image) */}
        <div className="hidden max-w-sm text-white lg:block">
          <p className="text-[calc(28px*var(--text-scale))] font-bold tracking-tight">{asideTitle}</p>
          <p className="mt-sm text-[calc(15px*var(--text-scale))] leading-relaxed text-white/80">{asideBody}</p>
          <p className="mt-lg text-[calc(13px*var(--text-scale))] text-white/70">
            <Link href="/" className="underline-offset-2 hover:underline">
              Back to home
            </Link>
            {' · '}
            <Link href="/account/sign-in" className="underline-offset-2 hover:underline">
              Attendee sign in
            </Link>
          </p>
        </div>
      </div>

      {/* Mobile escape links */}
      <p className="relative z-[1] pb-lg text-center text-[calc(13px*var(--text-scale))] text-white/80 lg:hidden">
        <Link href="/" className="underline-offset-2 hover:underline">
          Home
        </Link>
        {' · '}
        <Link href="/account/sign-in" className="underline-offset-2 hover:underline">
          Attendee sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * Optional “or” divider + SSO slot placeholder.
 * Not rendered on /login until TODO(auth-sso) is done.
 */
export function AuthSsoSlotPlaceholder() {
  return (
    <div className="flex flex-col gap-sm" data-auth-sso-placeholder>
      {/* TODO(auth-sso): wire real providers; keep this divider pattern from Auth 3 */}
      <div className="flex items-center gap-sm text-on-surface-variant">
        <span className="h-px flex-1 bg-outline-variant" />
        <span className="text-[calc(12px*var(--text-scale))]">or</span>
        <span className="h-px flex-1 bg-outline-variant" />
      </div>
      <p className="text-center text-[calc(12px*var(--text-scale))] text-on-surface-variant">
        SSO coming later
      </p>
    </div>
  );
}
