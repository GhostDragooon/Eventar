export type SettingOption = { id: string; title: string; description: string };

export function SettingsCards({
  options,
  selected,
  onChange,
}: {
  options: readonly SettingOption[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <fieldset>
      <legend className="sr-only">Settings</legend>
      <div className="grid gap-md sm:grid-cols-2">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <label
              key={option.id}
              className={
                active
                  ? 'flex cursor-pointer gap-md rounded-[20px] border border-primary bg-primary-container p-md text-on-primary-container'
                  : 'flex cursor-pointer gap-md rounded-[20px] border border-outline-variant bg-surface-container-lowest p-md text-on-surface'
              }
            >
              <input
                type="checkbox"
                checked={active}
                onChange={() => toggle(option.id)}
                className="mt-xs size-5 accent-primary"
              />
              <span>
                <strong className="block">{option.title}</strong>
                <small className={active ? 'text-on-primary-container' : 'text-on-surface-variant'}>
                  {option.description}
                </small>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
