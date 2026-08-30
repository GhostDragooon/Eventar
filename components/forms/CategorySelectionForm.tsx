'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MultiSelectCombobox, type ComboboxOption } from './MultiSelectCombobox';

export function CategorySelectionForm({
  options,
  initialSelected = [],
  onSubmit,
}: {
  options: readonly ComboboxOption[];
  initialSelected?: readonly string[];
  onSubmit: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<readonly string[]>(initialSelected);
  const [touched, setTouched] = useState(false);
  const invalid = touched && selected.length === 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (selected.length) onSubmit([...selected]);
  }

  return (
    <form onSubmit={submit} className="space-y-md">
      <MultiSelectCombobox label="Categories" options={options} selected={selected} onChange={setSelected} />
      {invalid && <p role="alert" className="text-error">Select at least one category.</p>}
      <Button type="submit" className="min-h-11 px-lg">Continue</Button>
    </form>
  );
}
