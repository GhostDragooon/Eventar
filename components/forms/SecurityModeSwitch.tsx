'use client';

export type SecurityMode = 'standard' | 'restricted';

export function SecurityModeSwitch({
  value,
  onChange,
  error,
}: {
  value: SecurityMode | null;
  onChange: (value: SecurityMode) => void;
  error?: string | null;
}) {
  return (
    <fieldset className="space-y-sm">
      <legend className="font-label-md text-label-md text-on-surface">
        Security mode <span className="text-error">*</span>
      </legend>
      <div className="grid gap-sm sm:grid-cols-2">
        {(['standard', 'restricted'] as const).map((mode) => (
          <label
            key={mode}
            className={
              value === mode
                ? 'flex cursor-pointer gap-sm rounded-[12px] border border-primary bg-primary-container p-md text-on-primary-container'
                : 'flex cursor-pointer gap-sm rounded-[12px] border border-outline-variant bg-surface-container-lowest p-md text-on-surface'
            }
          >
            <input
              type="radio"
              name="security-mode"
              value={mode}
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="mt-xs size-5 accent-primary"
            />
            <span>
              <strong className="block capitalize">{mode}</strong>
              <small className={value === mode ? 'text-on-primary-container' : 'text-on-surface-variant'}>
                {mode === 'standard' ? 'Use the normal authorised workflow.' : 'Apply the restricted handling workflow.'}
              </small>
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-error">{error}</p>}
    </fieldset>
  );
}
