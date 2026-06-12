/** @vitest-environment jsdom */
import { vi } from 'vitest';

// The Server Action import pulls in 'server-only' — forbidden in jsdom builds.
// These tests are about the form's rendering + payload shape, not the action.
const { mockSubmitSurvey } = vi.hoisted(() => ({
  mockSubmitSurvey: vi.fn(async () => ({ ok: true as const })),
}));
vi.mock('./actions', () => ({ submitSurvey: mockSubmitSurvey }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import SurveyForm from './SurveyForm';

// Vitest doesn't auto-import RTL's cleanup (project config has `globals` off);
// without this, renders accumulate in jsdom across tests.
afterEach(cleanup);

const blockId = '22222222-3333-4444-8555-666666666666';

const baseProps = {
  code: 'WK-ABCDEF',
  eventTitle: 'Oncology Summit',
  eventStartTime: '2026-06-15T09:00:00Z',
  eventTimezone: 'Europe/Vilnius',
  eventVenueName: 'Office HQ',
  firstName: 'Ivan',
  sessionOptions: [
    { value: blockId, label: 'Biomarkers in Practice · Dr. Lee' },
    { value: '33333333-4444-4555-8666-777777777777', label: 'Opening Keynote' },
  ],
};

beforeEach(() => {
  mockSubmitSurvey.mockClear();
});

describe('SurveyForm — Q2 session single-select (G1)', () => {
  it('renders the schedule options plus the General fallback, and no textarea', () => {
    const { getByLabelText, queryByRole, container } = render(<SurveyForm {...baseProps} />);

    expect(getByLabelText('Biomarkers in Practice · Dr. Lee')).toBeInTheDocument();
    expect(getByLabelText('Opening Keynote')).toBeInTheDocument();
    expect(getByLabelText('General sessions / overall')).toBeInTheDocument();
    expect(queryByRole('textbox')).toBeNull();
    expect(container.querySelector('textarea')).toBeNull();
  });

  it('renders only the General fallback when the event has no schedule', () => {
    const { container } = render(<SurveyForm {...baseProps} sessionOptions={[]} />);

    const q2Radios = container.querySelectorAll('input[name="valuable_session"]');
    expect(q2Radios).toHaveLength(1);
    expect((q2Radios[0] as HTMLInputElement).value).toBe('general');
  });

  it('submits the selected block uuid as valuable_session', async () => {
    const { getByLabelText, getByRole } = render(<SurveyForm {...baseProps} />);

    fireEvent.click(getByLabelText('Biomarkers in Practice · Dr. Lee'));
    fireEvent.click(getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockSubmitSurvey).toHaveBeenCalledTimes(1));
    expect(mockSubmitSurvey).toHaveBeenCalledWith(
      'WK-ABCDEF',
      expect.objectContaining({ valuable_session: blockId }),
    );
  });

  it("submits 'general' when the fallback is selected", async () => {
    const { getByLabelText, getByRole } = render(<SurveyForm {...baseProps} />);

    fireEvent.click(getByLabelText('General sessions / overall'));
    fireEvent.click(getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockSubmitSurvey).toHaveBeenCalledTimes(1));
    expect(mockSubmitSurvey).toHaveBeenCalledWith(
      'WK-ABCDEF',
      expect.objectContaining({ valuable_session: 'general' }),
    );
  });

  it('omits valuable_session when nothing is selected', async () => {
    const { getByRole } = render(<SurveyForm {...baseProps} />);

    fireEvent.click(getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(mockSubmitSurvey).toHaveBeenCalledTimes(1));
    expect(mockSubmitSurvey).toHaveBeenCalledWith(
      'WK-ABCDEF',
      expect.objectContaining({ valuable_session: undefined }),
    );
  });
});

describe('SurveyForm — intro line (locked copy, patterns §12)', () => {
  it('greets by first name with the five-questions / under-3-minutes promise', () => {
    const { getByText } = render(<SurveyForm {...baseProps} />);

    expect(
      getByText('Thank you for attending, Ivan—please complete five quick questions (under 3 minutes).'),
    ).toBeInTheDocument();
  });
});
