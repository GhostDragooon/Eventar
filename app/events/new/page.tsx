'use client';
import { useState, useTransition } from 'react';
import { createEvent } from './actions';

export default function NewEventPage() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">New event</h1>

      <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        The new event form with venue search and agenda blocks is coming in the next update.
        For now you can create events via the API or wait for Task 8.
      </div>

      <form
        action={(fd) =>
          start(async () => {
            setErr(null);
            const res = await createEvent({ event: Object.fromEntries(fd), blocks: [] });
            if (res && 'error' in res) setErr(res.error);
          })
        }
        className="space-y-4"
      >
        <Field name="title" label="Title" required />
        <Field name="topic" label="Topic" />
        <div className="grid grid-cols-2 gap-4">
          <Field name="start_time" label="Start (UTC ISO)" required type="text" placeholder="2026-06-15T09:00:00.000Z" />
          <Field name="end_time" label="End (UTC ISO)" required type="text" placeholder="2026-06-15T16:00:00.000Z" />
        </div>
        <Field name="venue_name" label="Venue name" required />
        <Field name="city" label="City" required />
        <Field name="country" label="Country" required />
        <Field name="latitude" label="Latitude" required type="number" />
        <Field name="longitude" label="Longitude" required type="number" />
        <Field name="description" label="Description" />
        <Field name="max_attendees" label="Max attendees (optional)" type="number" />

        <button
          disabled={pending}
          className="rounded-md bg-black text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {pending ? 'Creating…' : 'Create event'}
        </button>
        {err && <p className="text-sm text-red-700 whitespace-pre-wrap">{err}</p>}
      </form>
    </main>
  );
}

function Field(p: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{p.label}</label>
      <input
        name={p.name}
        type={p.type ?? 'text'}
        required={p.required}
        placeholder={p.placeholder}
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
    </div>
  );
}
