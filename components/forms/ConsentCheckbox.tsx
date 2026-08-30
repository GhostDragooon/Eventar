export function ConsentCheckbox({
  id,
  label,
  description,
  checked,
  onChange,
  required = false,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  required?: boolean;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-md rounded-[12px] border border-outline-variant bg-surface-container-lowest p-md">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        required={required}
        className="mt-xs size-5 accent-primary"
      />
      <span>
        <strong className="block text-on-surface">
          {label}
          {required && <span className="text-error"> *</span>}
        </strong>
        <small className="text-on-surface-variant">{description}</small>
      </span>
    </label>
  );
}
