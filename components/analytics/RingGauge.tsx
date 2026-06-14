import { RING_CIRCUMFERENCE, RING_RADIUS, ringDashArray, ringFraction } from '@/lib/analytics/ringMath';

/**
 * Pure-SVG ring gauge for the AN headline block. Accent stroke (default
 * --primary) on a --surface-container-high track, per E.5 spec.
 *
 * `value`/`max` drive the dashed fill arc. `label` is the metric name (read
 * out by `role="meter"`). The numeric centre comes from the caller via
 * `displayValue` — usually the raw count or a percent string — so the gauge
 * doesn't have to decide formatting.
 */
const STROKE_WIDTH = 8;
const SIZE = (RING_RADIUS + STROKE_WIDTH) * 2;

export function RingGauge({
  value,
  max,
  label,
  displayValue,
  caption,
}: {
  value: number;
  max: number;
  label: string;
  displayValue: string;
  caption?: string;
}) {
  const fraction = ringFraction(value, max);
  const pct = Math.round(fraction * 100);

  return (
    <div className="flex flex-col items-center gap-sm">
      <div
        className="relative"
        role="meter"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max > 0 ? max : 1}
        aria-valuetext={`${displayValue} (${pct}%)`}
      >
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          aria-hidden
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-surface-container-high)"
            strokeWidth={STROKE_WIDTH}
          />
          {/* Fill arc — rotate -90deg so dash starts at 12 o'clock */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={ringDashArray(value, max)}
            strokeDashoffset={0}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dasharray 240ms ease-out' }}
          />
          {/* Centre numeric — kept inside SVG so it sizes with the gauge */}
          <text
            x={SIZE / 2}
            y={SIZE / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-on-surface"
            style={{ font: '700 22px var(--font-display, sans-serif)' }}
          >
            {displayValue}
          </text>
        </svg>
      </div>
      <div className="text-center">
        <p className="text-label-md font-label-md text-on-surface-variant uppercase tracking-wide">{label}</p>
        {caption && <p className="text-label-sm text-on-surface-variant mt-[2px]">{caption}</p>}
      </div>
    </div>
  );
}

// Re-exported for tests / Storybook-style callers that want to introspect.
export { RING_CIRCUMFERENCE };
