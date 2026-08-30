import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement matchMedia — needed by any component that checks
// prefers-reduced-motion (first caller: ExpandableEventCard). Defaults to
// "no preference" so animations run in tests unless a test overrides it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// jsdom also doesn't implement the Web Animations API — the UI-port
// foundation's declared motion standard (docs/ui-port/PORT_MANIFEST
// motion.implementation). First caller: ExpandableEventCard's open/close
// transition; more categories will use this the same way.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
  Element.prototype.animate = function () {
    return {
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      finished: Promise.resolve(),
      onfinish: null,
      oncancel: null,
      playState: 'finished',
    } as unknown as Animation;
  };
}
