'use client';
import { useState, useTransition, useEffect } from 'react';
import { createEvent } from './actions';
import { browserTz } from '@/lib/tz';

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tz, setTz] = useState('UTC');
  useEffect(() => setTz(browserTz()), []);

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">New event</h1>

      <form
        action={(fd) =>
          start(async () => {
            setErr(null);
            const res = await createEvent(fd);
            if (res && 'error' in res) setErr(res.error);
          })
        }
        className="space-y-4"
      >
        <Field name="title" label="Title" required />
        <Field name="topic" label="Topic" />
        <div>
          <label className="block text-sm font-medium mb-1">Format</label>
          <select
            name="format"
            className="w-full rounded-md border border-gray-300 px-3 py-2"
            defaultValue="workshop"
          >
            <option value="workshop">Workshop</option>
            <option value="seminar">Seminar</option>
            <option value="roundtable">Roundtable</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field name="start_time" label="Start (UTC ISO)" required type="text" placeholder="2026-06-15T09:00:00.000Z" />
          <Field name="end_time" label="End (UTC ISO)" required type="text" placeholder="2026-06-15T10:30:00.000Z" />
        </div>
        <Field name="timezone" label="Timezone (IANA)" defaultValue={tz} required />
        <Field name="location" label="Location" />
        <TextArea name="description" label="Description" />
        <TextArea name="agenda" label="Agenda" />
        <Field name="max_attendees" label="Max attendees (optional)" type="number" />

        <button
          disabled={pending}
          className="rounded-md bg-black text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create event'}
        </button>
        {err && <p className="text-sm text-red-700 whitespace-pre-wrap">{err}</p>}
      </form>

      <p className="text-xs text-gray-500">
        Note: phase 1 uses plain text ISO inputs. A datetime picker is phase-7 polish.
      </p>
    </main>
  );
}

function Field(p: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{p.label}</label>
      <input
        name={p.name}
        type={p.type ?? 'text'}
        required={p.required}
        defaultValue={p.defaultValue}
        placeholder={p.placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
  );
}

function TextArea(p: { name: string; label: string }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{p.label}</label>
      <textarea
        name={p.name}
        rows={4}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
  );
}
