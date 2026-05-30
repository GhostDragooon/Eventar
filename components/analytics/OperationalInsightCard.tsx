import { operationalInsightText, type NarrativeMetrics } from '@/lib/analytics/narrative';

export function OperationalInsightCard({ metrics }: { metrics: NarrativeMetrics }) {
  return (
    <div className="mt-lg p-lg bg-surface-container rounded-xxl border border-outline-variant flex items-start gap-md">
      <span className="material-symbols-outlined text-primary" aria-hidden>
        info
      </span>
      <div>
        <h3 className="font-title-lg text-on-surface mb-xs">Operational Insight</h3>
        <p className="text-body-md text-on-surface-variant">{operationalInsightText(metrics)}</p>
      </div>
    </div>
  );
}
