'use client';

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';

export type SelectGroupRecord = { label: string; options: readonly { value: string; label: string; disabled?: boolean }[] };

export function GroupedSelect({
  label,
  value,
  groups,
  placeholder = 'Select an option',
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  groups: readonly SelectGroupRecord[];
  placeholder?: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="block space-y-xs">
      <span className="font-label-md text-label-md text-on-surface">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      <Select value={value} onValueChange={(value) => value && onChange(String(value))}>
        <SelectTrigger className="min-h-11 w-full border-outline-variant bg-surface-container-lowest">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {groups.map((group) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
