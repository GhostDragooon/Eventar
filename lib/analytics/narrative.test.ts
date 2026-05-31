import { describe, expect, it } from 'vitest';
import { keyMetricAnalysisText, operationalInsightText } from './narrative';

describe('operationalInsightText', () => {
  it('flags expectation gap when show-up high + happy low', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.7, responseRate: 0.5 });
    expect(out.toLowerCase()).toContain('expectation gap');
  });

  it('flags promo / timing concern when show-up low', () => {
    const out = operationalInsightText({ showUpRate: 0.4, happyRate: 0.9, responseRate: 0.5 });
    expect(out.toLowerCase()).toMatch(/timing|reminder|promo/);
  });

  it('returns a "healthy" message when show-up high + happy high', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.92, responseRate: 0.5 });
    expect(out.toLowerCase()).toMatch(/healthy|strong|on track/);
  });

  it('flags low signal when response rate below 50%', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: 0.92, responseRate: 0.3 });
    expect(out.toLowerCase()).toContain('low response');
  });

  it('falls back to "mixed signals" with em-dash when happyRate is null', () => {
    const out = operationalInsightText({ showUpRate: 0.65, happyRate: null, responseRate: 0.6 });
    expect(out.toLowerCase()).toContain('mixed signals');
    expect(out).toContain('—');
  });

  it('returns zero-attendance message when showUpRate is 0', () => {
    const out = operationalInsightText({ showUpRate: 0, happyRate: null, responseRate: 0 });
    expect(out.toLowerCase()).toContain('no check-ins');
  });

  it('distinguishes zero-survey-response from low-response-rate', () => {
    const out = operationalInsightText({ showUpRate: 0.8, happyRate: null, responseRate: 0 });
    expect(out.toLowerCase()).toContain('no survey responses');
    expect(out.toLowerCase()).not.toContain('low response rate');
  });

  it('does NOT misattribute null happyRate as expectation gap', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: null, responseRate: 0.6 });
    expect(out.toLowerCase()).not.toContain('expectation gap');
    expect(out.toLowerCase()).not.toContain('neutral/negative');
  });

  it('does NOT claim "healthy" when Q4 data is missing', () => {
    const out = operationalInsightText({ showUpRate: 0.85, happyRate: null, responseRate: 0.6 });
    expect(out.toLowerCase()).not.toMatch(/healthy|on track/);
  });
});

describe('keyMetricAnalysisText', () => {
  it('is non-empty boilerplate that mentions show-up + Q4 cross-reference', () => {
    const out = keyMetricAnalysisText({ showUpRate: 0.82, happyRate: 0.91, responseRate: 0.7 });
    expect(out.length).toBeGreaterThan(40);
    expect(out.toLowerCase()).toMatch(/show-up|attendance/);
    expect(out.toLowerCase()).toMatch(/satisfaction|expectations|q4/);
  });
});
