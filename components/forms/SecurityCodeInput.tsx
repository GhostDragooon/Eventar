'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SecurityCodeInput({
  label,
  value,
  onChange,
  length = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
}) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();

  function update(raw: string) {
    onChange(raw.replace(/\D/g, '').slice(0, length));
  }

  return (
    <div className="space-y-xs">
      {/* Explicit htmlFor, not a wrapping <label> — the row holds two
          interactive elements (input + Show/Hide), and a label wrapping
          more than one control is an ambiguous implicit association for
          both assistive tech and accessible-name queries. */}
      <label htmlFor={inputId} className="font-label-md text-label-md text-on-surface">{label}</label>
      <div className="flex gap-sm">
        <Input
          id={inputId}
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="one-time-code"
          value={value}
          onChange={(event) => update(event.target.value)}
          maxLength={length}
          className="min-h-11 font-mono tracking-widest"
          aria-describedby="security-code-help"
        />
        <Button type="button" variant="outline" aria-pressed={visible} onClick={() => setVisible(!visible)} className="min-h-11 px-md">
          {visible ? 'Hide' : 'Show'}
        </Button>
      </div>
      <small id="security-code-help" className="text-on-surface-variant">Enter {length} digits.</small>
    </div>
  );
}
