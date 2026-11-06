/** @vitest-environment jsdom */
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import AgendaSection, { type BlockDraft } from './AgendaSection';

afterEach(cleanup);

const block = (localId: string, start: string, end: string): BlockDraft => ({
  localId, start, end, kind: 'lecture', title: localId, host: '', topics: [], notes: '', sponsored: false, sponsorName: '',
});

function Harness({ initial }: { initial: BlockDraft[] }) {
  const [blocks, setBlocks] = useState(initial);
  return (
    <>
      <AgendaSection date="2026-12-01" eventStartMinutes={8 * 60} eventEndMinutes={18 * 60} blocks={blocks} onChange={setBlocks} />
      <button type="button">elsewhere</button>
    </>
  );
}

const order = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-block-id]')).map((el) => el.getAttribute('data-block-id'));

function pickStart(cardIndex: number, optionName: string) {
  fireEvent.click(screen.getAllByLabelText('Block start time (required)')[cardIndex]!);
  fireEvent.click(screen.getByRole('option', { name: optionName }));
}

describe('AgendaSection ordering', () => {
  it('shows blocks in start-time order', () => {
    const { container } = render(<Harness initial={[block('late', '14:00', '15:00'), block('early', '09:00', '10:00')]} />);
    expect(order(container)).toEqual(['early', 'late']);
  });

  it('keeps the card whose start was just picked where it is until the pointer or focus leaves it, then sorts', () => {
    const { container } = render(<Harness initial={[block('A', '09:00', '10:00'), block('B', '10:00', '11:00')]} />);
    expect(order(container)).toEqual(['A', 'B']);

    pickStart(0, '11:00 AM'); // A now starts after B, but the card must not jump away under the cursor
    expect(order(container)).toEqual(['A', 'B']);

    fireEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(order(container)).toEqual(['B', 'A']);
  });

  // Review R2 m3: the list used to re-sort on the press, so the control under the pointer moved before the release
  // and the click landed on whatever slid into its place. A browser also moves focus on the press, so focusin counts too.
  it('does not re-sort between the press and the release of a click outside the card', () => {
    const { container } = render(<Harness initial={[block('A', '09:00', '10:00'), block('B', '10:00', '11:00')]} />);
    pickStart(0, '11:00 AM');
    const elsewhere = screen.getByRole('button', { name: 'elsewhere' });

    fireEvent.mouseDown(elsewhere);
    fireEvent.focusIn(elsewhere); // the press moved focus
    expect(order(container)).toEqual(['A', 'B']); // still held: the pointer has not been released yet

    fireEvent.mouseUp(elsewhere);
    expect(order(container)).toEqual(['A', 'B']);
    fireEvent.click(elsewhere);
    expect(order(container)).toEqual(['B', 'A']);
  });

  it('a click inside the same card does not release the hold; focus moving outside does', () => {
    const { container } = render(<Harness initial={[block('A', '09:00', '10:00'), block('B', '10:00', '11:00')]} />);
    pickStart(0, '11:00 AM');
    const cardA = container.querySelector('[data-block-id="A"]')!;
    fireEvent.mouseDown(cardA);
    fireEvent.mouseUp(cardA);
    fireEvent.click(cardA);
    expect(order(container)).toEqual(['A', 'B']);

    fireEvent.focusIn(screen.getByRole('button', { name: 'elsewhere' }));
    expect(order(container)).toEqual(['B', 'A']);
  });
});

describe('AgendaSection block error banner', () => {
  it('lists what the block still needs as a list, not a chain of "and" (re-walk 2026-11-06 MINOR 2)', () => {
    render(
      <AgendaSection date="2026-12-01" eventStartMinutes={8 * 60} eventEndMinutes={18 * 60} showAllErrors
        blocks={[{ ...block('k', '', ''), kind: 'keynote', title: '', topics: [{ title: '', speaker_name: '', speaker_credential: '', speaker_affiliation: '' }] } as BlockDraft]}
        onChange={() => {}} />,
    );
    expect(screen.getByText('Still needed to continue: start time, end time, title and topic 1 (title + speaker).')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Please enter a valid/);
  });
});
