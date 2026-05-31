export type NarrativeMetrics = {
  showUpRate: number; // 0..1
  happyRate: number | null; // 0..1 or null
  responseRate: number; // 0..1
};

export function operationalInsightText(m: NarrativeMetrics): string {
  if (m.showUpRate === 0) {
    return `No check-ins recorded yet. The page will fill in once attendees arrive and submit feedback.`;
  }
  if (m.responseRate === 0) {
    return `${pct(m.showUpRate)} of registrants attended. No survey responses yet — check the survey link reached attendees.`;
  }
  if (m.responseRate < 0.5) {
    return `Low response rate (${pct(m.responseRate)}) means the feedback below is suggestive, not representative. Worth a follow-up nudge before drawing conclusions.`;
  }
  const happy = m.happyRate ?? 0;
  if (m.showUpRate >= 0.75 && m.happyRate !== null && happy < 0.8) {
    return `High show-up rate (${pct(m.showUpRate)}) coupled with ${pct(1 - happy)} neutral/negative sentiment suggests operational success but a potential expectation gap in content depth.`;
  }
  if (m.showUpRate < 0.6) {
    return `Show-up rate (${pct(m.showUpRate)}) is below the band where reminders and timing typically deliver — worth reviewing promo cadence, reminder send-time, and venue logistics before the next event.`;
  }
  if (m.showUpRate >= 0.6 && m.happyRate !== null && happy >= 0.9) {
    return `Show-up (${pct(m.showUpRate)}) and satisfaction (${pct(happy)}) are both in the healthy band — the event is on track. Focus future iterations on the requests in Q5.`;
  }
  return `Show-up rate ${pct(m.showUpRate)}; satisfaction ${m.happyRate == null ? '—' : pct(happy)}. Mixed signals — review Q5 requests and the highlights below for actionable next steps.`;
}

export function keyMetricAnalysisText(m: NarrativeMetrics): string {
  return `Show-up rate (attended ÷ registered = ${pct(m.showUpRate)}) is the operational health metric. Cross-referenced with Q4 satisfaction (${m.happyRate == null ? '—' : pct(m.happyRate)}), low rates signal promo or timing issues while high rates with low satisfaction point to on-the-day execution problems. Use this pair to direct next-event optimization toward marketing versus logistics.`;
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}
