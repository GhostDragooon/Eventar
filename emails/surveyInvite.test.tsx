import { describe, expect, it } from 'vitest';
import { renderSurveyInviteEmail } from './surveyInvite';

describe('renderSurveyInviteEmail', () => {
  const sampleProps = {
    firstName: 'Alice',
    eventTitle: 'Q3 Engineering All-Hands',
    eventStart: '12 Sep 2026, 10:00',
    eventVenue: 'Conference Room A, 12/F HQ',
    surveyUrl: 'https://eventar.example.com/survey?code=WK-2345XY',
    editionLabel: 'CC-Asia 2026',
  };

  it('contains the event details and the blue feedback eyebrow', async () => {
    const html = await renderSurveyInviteEmail(sampleProps);
    expect(html).toContain('Q3 Engineering All-Hands');
    expect(html).toContain('12 Sep 2026, 10:00');
    expect(html).toContain('Conference Room A, 12/F HQ');
    expect(html).toMatch(/Feedback · CC-Asia 2026/);
  });

  it('greets with the first name', async () => {
    const html = await renderSurveyInviteEmail(sampleProps);
    expect(html).toMatch(/Thanks for coming, (?:<!-- -->)?Alice(?:<!-- -->)?\./);
  });

  it('shows the survey meta line', async () => {
    const html = await renderSurveyInviteEmail(sampleProps);
    expect(html).toContain('5 questions');
    expect(html).toContain('Anonymous');
  });

  it('renders the blue CTA linking to the survey URL', async () => {
    const html = await renderSurveyInviteEmail(sampleProps);
    expect(html).toMatch(/<td[^>]*>[\s\S]*?<a[^>]*href="https:\/\/eventar\.example\.com\/survey\?code=WK-2345XY"[\s\S]*?Start the survey/);
  });

  it('contains no literal "undefined" or "null"', async () => {
    const html = await renderSurveyInviteEmail({ ...sampleProps, editionLabel: undefined });
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('renders to table-based HTML (no flex/grid)', async () => {
    const html = await renderSurveyInviteEmail(sampleProps);
    expect(html).toContain('<table');
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
  });
});
