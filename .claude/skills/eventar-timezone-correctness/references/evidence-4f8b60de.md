// fillValidEvent picks today at 09:00, so which check-in sentence shows depends on the hour the suite runs.
  // Pin the clock (Date only, waitFor keeps its real timers) to 06:00 local: check-in at 08:00 is still ahead.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 23, 6, 0, 0) });
  });