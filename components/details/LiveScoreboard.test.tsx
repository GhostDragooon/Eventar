/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { LiveScoreboard } from './LiveScoreboard';

afterEach(cleanup);

const NOW = Date.UTC(2026, 9, 3, 6, 0);
const DAY = 86_400_000;
const props = {
  startMs: NOW + 31 * DAY,
  endMs: NOW + 31 * DAY + 3 * 3_600_000,
  serverNowMs: NOW,
  startLabel: '10:00',
  endLabel: '13:00',
  registered: 0,
  capacity: null,
  attended: 0,
  responses: 0,
};

describe('LiveScoreboard', () => {
  it('a draft reads Draft / not published, with no elapsed or wraps-in timer (acceptance walk MAJOR #20)', () => {
    render(<LiveScoreboard lifecycle="drafted" {...props} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Not yet')).toBeInTheDocument();
    expect(screen.queryByText('ELAPSED')).toBeNull();
    expect(screen.queryByText('WRAPS IN')).toBeNull();
    expect(screen.queryByText(/ now$/)).toBeNull();
  });

  it('a live event still shows elapsed and wraps-in', () => {
    render(<LiveScoreboard lifecycle="live" {...props} startMs={NOW - 3_600_000} endMs={NOW + 3_600_000} />);
    expect(screen.getByText('ELAPSED')).toBeInTheDocument();
    expect(screen.getByText('WRAPS IN')).toBeInTheDocument();
  });
});
