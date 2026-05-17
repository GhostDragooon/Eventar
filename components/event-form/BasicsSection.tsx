'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export type BasicsValue = {
  title: string;
  topic: string;
  description: string;
  capacity: string;  // string because the input may be empty; coerced in submit
};

type Props = {
  value: BasicsValue;
  onChange: (patch: Partial<BasicsValue>) => void;
};

export default function BasicsSection({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="block text-sm font-medium mb-1">Event name</span>
        <Input
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Workshop on TDD"
          required
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Topic tag (optional)</span>
        <Input
          value={value.topic}
          onChange={(e) => onChange({ topic: e.target.value })}
          placeholder="engineering · onboarding · etc."
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Description</span>
        <Textarea
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={4}
          placeholder="One paragraph about the workshop."
        />
      </label>

      <label className="block">
        <span className="block text-sm font-medium mb-1">Capacity (optional)</span>
        <Input
          type="number"
          min={1}
          value={value.capacity}
          onChange={(e) => onChange({ capacity: e.target.value })}
          placeholder="e.g. 50"
        />
      </label>
    </div>
  );
}

export function basicsSummary(v: BasicsValue): string {
  return `${v.title || '(untitled)'} · ${v.capacity || '—'} max`;
}

export function basicsValid(v: BasicsValue): boolean {
  return v.title.trim().length > 0;
}
