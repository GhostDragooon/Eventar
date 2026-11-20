'use client';

import { useSyncExternalStore } from 'react';

// True below the `md` breakpoint (768px). Menus use it to render as a bottom
// sheet on phones and a popover above. Server and first paint report false, so
// the popover markup is what hydrates; matchMedia is absent in jsdom, which
// also reads as false.
const QUERY = '(max-width: 767.98px)';

function subscribe(onChange: () => void) {
  if (typeof matchMedia === 'undefined') return () => {};
  const mq = matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof matchMedia === 'undefined' ? false : matchMedia(QUERY).matches),
    () => false,
  );
}
