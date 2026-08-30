'use client';

import { useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ConsentCheckbox } from './ConsentCheckbox';

export type EnquiryValue = { name: string; email: string; message: string; consent: boolean };

export function ContactEnquiryForm({
  initialValue,
  onReady,
}: {
  initialValue: EnquiryValue;
  onReady: (value: EnquiryValue) => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.name.trim() || !/^\S+@\S+\.\S+$/.test(value.email) || !value.message.trim() || !value.consent) {
      setError('Complete the required fields and consent before continuing.');
      return;
    }
    setError(null);
    onReady(value);
  }

  return (
    <form onSubmit={submit} className="space-y-md" noValidate>
      <Field label="Name">
        <Input value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} />
      </Field>
      <Field label="Email">
        <Input type="email" value={value.email} onChange={(event) => setValue({ ...value, email: event.target.value })} />
      </Field>
      <Field label="Enquiry">
        <Textarea value={value.message} onChange={(event) => setValue({ ...value, message: event.target.value })} rows={6} />
      </Field>
      <ConsentCheckbox
        id="enquiry-consent"
        label="I agree to the stated contact use"
        description="Consent text must be replaced with the approved production wording."
        checked={value.consent}
        onChange={(consent) => setValue({ ...value, consent })}
        required
      />
      {error && <p role="alert" className="text-error">{error}</p>}
      <Button type="submit" className="min-h-11 px-lg">Prepare enquiry</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-xs">
      <span className="font-label-md text-label-md text-on-surface">
        {label} <span className="text-error">*</span>
      </span>
      {children}
    </label>
  );
}
