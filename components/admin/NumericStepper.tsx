// ui-primitive-allow: a connected two-button stepper, the same "segmented
// group" shape as ActionGroup/ToggleGroup — the shared rounded-lg wrapper
// convention for grouped controls, not standalone pills. <Button>'s icon
// sizes (size-8/size-9) are also smaller than the size-11 (44px) minimum
// touch target this stepper needs.
export function NumericStepper({
  label,
  value,
  min = 0,
  max = 99,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-11 place-items-center text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
      >
        −
      </button>
      <output aria-label={label} className="grid min-h-11 min-w-14 place-items-center border-x border-outline-variant font-title-lg text-title-lg text-on-surface">
        {value}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-11 place-items-center text-on-surface focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
