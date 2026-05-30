export function EventRowStrip({
  registered,
  attended,
  surveys,
  happyPct,
}: {
  registered: number;
  attended: number;
  surveys: number;
  happyPct: number | null;
}) {
  const attPct = registered > 0 ? Math.round((attended / registered) * 100) : 0;
  return (
    <div className="flex items-center gap-md flex-wrap text-label-md font-label-md mt-sm">
      <span className="bg-surface-container-high text-on-surface-variant px-sm py-xs rounded-full">
        Reg {registered}
      </span>
      <span className="bg-surface-container-high text-on-surface-variant px-sm py-xs rounded-full">
        Att {attended} · {attPct}%
      </span>
      <span className="bg-primary-container/10 text-primary px-sm py-xs rounded-full border border-primary-container/20">
        Surveys {surveys}
        {happyPct != null && ` · ${happyPct}% happy`}
      </span>
    </div>
  );
}
