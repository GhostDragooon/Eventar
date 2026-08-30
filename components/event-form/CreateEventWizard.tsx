'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  EventDateTimeRangePicker,
  validateDateTimeRange,
  type EventDateTimeRangeValue,
} from '@/components/event-discovery/EventDateTimeRangePicker';
import { EventWizardStepIndicator, type WizardStep } from './EventWizardStepIndicator';
import { formatMinutes12h } from './TimePicker15';

export type CreateEventWizardValue = {
  title: string;
  officialTitle: string;
  format: string;
  summary: string;
  startDate?: string;
  startTime?: number | null;
  endDate?: string;
  endTime?: number | null;
};

type Props = {
  value: CreateEventWizardValue;
  onChange: (value: CreateEventWizardValue) => void;
  onReady: (value: CreateEventWizardValue) => void;
};

const STEPS: WizardStep[] = [
  { id: 'basics', label: 'Basics' },
  { id: 'when', label: 'When' },
  { id: 'review', label: 'Review' },
];

function toRange(value: CreateEventWizardValue): EventDateTimeRangeValue {
  return {
    startDate: value.startDate ?? '',
    startTime: value.startTime ?? null,
    endDate: value.endDate ?? '',
    endTime: value.endTime ?? null,
  };
}

export function CreateEventWizard({ value, onChange, onReady }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const [basicsError, setBasicsError] = useState<string | null>(null);
  const stepRef = useRef<HTMLDivElement>(null);

  // The step indicator lets a user jump back to any completed step, edit
  // it, then jump forward again — bypassing the per-step Continue gates.
  // Move focus to the newly-shown step's first control so keyboard/screen
  // reader users aren't dropped on <body> after Continue/Back unmounts the
  // previous step's button (mirrors ExpandableEventCard's focus handling).
  useEffect(() => {
    const first = stepRef.current?.querySelector<HTMLElement>(
      'input, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [stepIndex]);

  function completeStep(index: number) {
    setCompleted((prev) => (prev.includes(index) ? prev : [...prev, index]));
  }

  function handleBasicsContinue() {
    if (!value.title.trim()) {
      setBasicsError('Event name is required.');
      return;
    }
    setBasicsError(null);
    completeStep(0);
    setStepIndex(1);
  }

  const range = toRange(value);
  const rangeError = validateDateTimeRange(range);
  const rangeComplete = Boolean(
    range.startDate && range.startTime !== null && range.endDate && range.endTime !== null,
  );

  function handleWhenContinue() {
    if (!rangeComplete || rangeError) return;
    completeStep(1);
    setStepIndex(2);
  }

  function handleCreate() {
    // Re-validate regardless of how the user reached this step — the step
    // indicator allows jumping straight here from a completed step without
    // passing back through the Continue gates.
    if (!value.title.trim()) {
      setBasicsError('Event name is required.');
      setStepIndex(0);
      return;
    }
    if (!rangeComplete || rangeError) {
      setStepIndex(1);
      return;
    }
    completeStep(2);
    onReady(value);
  }

  return (
    <div className="space-y-lg">
      <EventWizardStepIndicator
        steps={STEPS}
        currentIndex={stepIndex}
        completedIndexes={completed}
        onStepSelect={setStepIndex}
      />

      {stepIndex === 0 && (
        <div ref={stepRef} className="space-y-md">
          <label className="block">
            <FieldLabel required>Event name</FieldLabel>
            <Input
              value={value.title}
              onChange={(e) => onChange({ ...value, title: e.target.value })}
              aria-invalid={Boolean(basicsError)}
              placeholder="Clinical workshop"
            />
          </label>

          <label className="block">
            <FieldLabel>Official title (optional)</FieldLabel>
            <Input
              value={value.officialTitle}
              onChange={(e) => onChange({ ...value, officialTitle: e.target.value })}
              placeholder="Full accreditation-facing title, if different"
            />
          </label>

          <label className="block">
            <FieldLabel>Format (optional)</FieldLabel>
            <Input
              value={value.format}
              onChange={(e) => onChange({ ...value, format: e.target.value })}
              placeholder="Workshop, symposium, webinar…"
            />
          </label>

          <label className="block">
            <FieldLabel>Summary (optional)</FieldLabel>
            <Textarea
              value={value.summary}
              onChange={(e) => onChange({ ...value, summary: e.target.value })}
              rows={3}
              placeholder="One or two sentences for the event listing."
            />
          </label>

          {basicsError && (
            <p
              role="alert"
              className="font-body-md text-body-md text-error bg-error-container border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
            >
              <span className="material-symbols-outlined text-[calc(18px*var(--text-scale))] mt-[2px]" aria-hidden>
                warning
              </span>
              <span>{basicsError}</span>
            </p>
          )}

          <div className="flex justify-end pt-sm">
            <Button type="button" onClick={handleBasicsContinue} className="min-h-11 font-label-md text-label-md">
              Continue
            </Button>
          </div>
        </div>
      )}

      {stepIndex === 1 && (
        <div ref={stepRef} className="space-y-md">
          <EventDateTimeRangePicker value={range} onChange={(next) => onChange({ ...value, ...next })} />

          <div className="flex justify-between pt-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex(0)}
              className="min-h-11 font-label-md text-label-md"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleWhenContinue}
              disabled={!rangeComplete || Boolean(rangeError)}
              className="min-h-11 font-label-md text-label-md"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {stepIndex === 2 && (
        <div ref={stepRef} className="space-y-md">
          <dl className="space-y-sm rounded-[12px] bg-surface-container p-md">
            <ReviewRow label="Event name" value={value.title} />
            {value.format && <ReviewRow label="Format" value={value.format} />}
            <ReviewRow
              label="Starts"
              value={
                range.startDate
                  ? `${range.startDate}${range.startTime !== null ? `, ${formatMinutes12h(range.startTime)}` : ''}`
                  : 'Not set'
              }
            />
            <ReviewRow
              label="Ends"
              value={
                range.endDate
                  ? `${range.endDate}${range.endTime !== null ? `, ${formatMinutes12h(range.endTime)}` : ''}`
                  : 'Not set'
              }
            />
          </dl>

          <div className="flex justify-between pt-sm">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStepIndex(1)}
              className="min-h-11 font-label-md text-label-md"
            >
              Back
            </Button>
            <Button type="button" onClick={handleCreate} className="min-h-11 font-label-md text-label-md">
              Create event
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldLabel({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="block font-label-md text-label-md uppercase tracking-wider text-on-surface mb-xs">
      {children}
      {required && (
        <span className="text-error ml-xs" aria-label="required">
          *
        </span>
      )}
    </span>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md">
      <dt className="font-label-md text-label-md text-on-surface-variant">{label}</dt>
      <dd className="font-body-md text-body-md text-on-surface text-right">{value}</dd>
    </div>
  );
}
