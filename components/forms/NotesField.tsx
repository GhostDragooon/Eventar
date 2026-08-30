import { Textarea } from '@/components/ui/textarea';

export function NotesField({
  label = 'Additional notes',
  value,
  onChange,
  maxLength = 1000,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-xs">
      <span className="font-label-md text-label-md text-on-surface">
        {label} <span className="text-on-surface-variant">Optional</span>
      </span>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} maxLength={maxLength} rows={5} aria-describedby="notes-count" />
      <span id="notes-count" className="block text-right font-label-md text-label-md text-on-surface-variant">
        {value.length} of {maxLength}
      </span>
    </label>
  );
}
