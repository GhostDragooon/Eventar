export function LayerOneTiles({
  capacityPct,
  arrivalOnTimePct,
}: {
  capacityPct: number | null; // null when no events have max_attendees
  arrivalOnTimePct: number | null; // null when no one has checked in yet
}) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-grid-gutter mb-xl">
      <Tile
        label="Capacity Utilization"
        value={capacityPct == null ? '—' : `${capacityPct}%`}
        icon="event_seat"
        hint={capacityPct == null ? 'No capped events' : 'Registered ÷ Capacity (across capped events)'}
      />
      <Tile
        label="On-time Arrival"
        value={arrivalOnTimePct == null ? '—' : `${arrivalOnTimePct}%`}
        icon="schedule"
        hint={arrivalOnTimePct == null ? 'Awaiting first check-in' : 'Checked in within first 15 min of start'}
      />
    </section>
  );
}

function Tile({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: string;
  hint: string;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-[20px] p-lg border border-outline-variant shadow-sm flex flex-col justify-between min-h-[140px]">
      <div className="flex justify-between items-start">
        <h3 className="font-label-md text-label-md text-on-surface-variant uppercase">{label}</h3>
        <span
          className="material-symbols-outlined text-primary bg-primary-container/10 p-xs rounded-md"
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <div>
        <p className="font-display text-display text-on-surface">{value}</p>
        <p className="font-label-md text-label-md text-on-surface-variant mt-xs">{hint}</p>
      </div>
    </div>
  );
}
