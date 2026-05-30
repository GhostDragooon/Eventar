'use client';

import { useState, useTransition } from 'react';
import { formatInTz } from '@/lib/tz';
import {
  SESSION_FORMAT_OPTIONS,
  VALUE_PROPOSITION_OPTIONS,
  EXPECTATIONS_OPTIONS,
  FUTURE_PREFERENCE_OPTIONS,
  KEY_HIGHLIGHTS_MAX,
  type SessionFormat,
  type ValueProposition,
  type Expectation,
  type FuturePreference,
} from '@/lib/surveyTemplate';
import type { SurveyInput } from './schema';
import { submitSurvey } from './actions';

type State =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'ok' }
  | { kind: 'error'; message: string };

const CHOICE_BASE =
  'flex items-center px-md py-2.5 border cursor-pointer transition-colors rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-1';
const CHOICE_SELECTED = 'border-green-600 bg-green-50';
const CHOICE_UNSELECTED = 'border-outline-variant hover:bg-green-50';

export default function SurveyForm({
  code,
  eventTitle,
  eventStartTime,
  eventTimezone,
  eventVenueName,
}: {
  code: string;
  eventTitle: string;
  eventStartTime: string;
  eventTimezone: string;
  eventVenueName: string;
}) {
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>();
  const [keyHighlights, setKeyHighlights] = useState('');
  const [valueProposition, setValueProposition] = useState<ValueProposition>();
  const [expectations, setExpectations] = useState<Expectation>();
  const [futurePreferences, setFuturePreferences] = useState<FuturePreference[]>([]);

  const [state, setState] = useState<State>({ kind: 'idle' });
  const [, startTransition] = useTransition();

  function toggleFuture(value: FuturePreference) {
    setFuturePreferences((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: 'submitting' });

    const trimmed = keyHighlights.trim();
    const answers: SurveyInput = {
      session_format: sessionFormat,
      key_highlights: trimmed === '' ? undefined : trimmed,
      value_proposition: valueProposition,
      expectations,
      future_preferences: futurePreferences,
    };

    startTransition(async () => {
      const res = await submitSurvey(code, answers);
      if ('error' in res) {
        setState({ kind: 'error', message: res.error });
        return;
      }
      setState({ kind: 'ok' });
    });
  }

  return (
    <div className="flex-grow w-full max-w-7xl mx-auto px-grid-margin py-xl">
      <div className="grid grid-cols-12 gap-grid-gutter items-start">
        {/* Left focal header (4/12) */}
        <div className="col-span-12 lg:col-span-4 sticky lg:top-20">
          <h1 className="font-headline-md text-headline-md text-primary mb-sm">{eventTitle}</h1>
          <div className="font-body-md text-body-md text-on-surface-variant mb-md space-y-1">
            <p className="flex items-start gap-xs">
              <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>
                schedule
              </span>
              <span>{formatInTz(eventStartTime, eventTimezone)}</span>
            </p>
            <p className="flex items-start gap-xs">
              <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>
                location_on
              </span>
              <span>{eventVenueName}</span>
            </p>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant mb-lg leading-relaxed">
            Thank you for contributing your professional expertise. Please complete this brief
            assessment to help us enhance future events.
          </p>
          <div className="bg-primary/5 border border-primary/10 p-md rounded-lg">
            <div className="flex items-center gap-sm text-primary mb-1">
              <span className="material-symbols-outlined text-xl" aria-hidden>
                lock
              </span>
              <p className="font-label-md text-label-md uppercase tracking-wide font-bold">
                Anonymous feedback
              </p>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Your responses are anonymous and help shape future events.
            </p>
          </div>
        </div>

        {/* Survey content (8/12) */}
        <div className="col-span-12 lg:col-span-8">
          <div className="bg-surface-container-lowest border border-outline-variant rounded-lg p-lg shadow-sm">
            {state.kind === 'ok' ? (
              <div className="bg-primary text-on-primary rounded-[20px] p-lg text-center space-y-sm shadow-lg">
                <div
                  aria-hidden
                  className="inline-flex items-center justify-center w-14 h-14 bg-on-primary/10 rounded-full"
                >
                  <span className="material-symbols-outlined text-[28px]" data-fill="1">
                    check_circle
                  </span>
                </div>
                <p className="font-headline-sm text-headline-sm">Thank you</p>
                <p className="font-body-md text-body-md text-on-primary/80">
                  Your feedback for <em>{eventTitle}</em> was recorded.
                </p>
              </div>
            ) : (
              <form className="space-y-lg" onSubmit={onSubmit}>
                {/* Q1 Session Format (single) */}
                <fieldset className="space-y-sm">
                  <legend className="contents">
                    <span className="block font-label-md text-label-md text-outline uppercase tracking-wider">
                      01. Session Format
                    </span>
                    <span className="block font-title-lg text-body-lg font-semibold text-on-surface">
                      Which event format did you find most valuable?
                    </span>
                  </legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {SESSION_FORMAT_OPTIONS.map((opt) => {
                      const selected = sessionFormat === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`${CHOICE_BASE} ${selected ? CHOICE_SELECTED : CHOICE_UNSELECTED}`}
                        >
                          <input
                            className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                            name="session_format"
                            type="radio"
                            value={opt.value}
                            checked={selected}
                            onChange={() => setSessionFormat(opt.value)}
                          />
                          <span className="ml-3 font-body-md text-on-surface">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Q2 Key Highlights (text) */}
                <fieldset className="space-y-sm">
                  <legend className="contents">
                    <span className="block font-label-md text-label-md text-outline uppercase tracking-wider">
                      02. Key Highlights
                    </span>
                    <span className="block font-title-lg text-body-lg font-semibold text-on-surface">
                      Which speaker or session provided the most clinical utility?
                    </span>
                  </legend>
                  <textarea
                    className="w-full h-24 p-3 border border-outline-variant rounded focus:ring-1 focus:ring-primary focus:border-primary outline-none font-body-md transition-all resize-none"
                    placeholder="Enter session name or specific clinical takeaway..."
                    maxLength={KEY_HIGHLIGHTS_MAX}
                    value={keyHighlights}
                    onChange={(e) => setKeyHighlights(e.target.value)}
                  />
                </fieldset>

                {/* Q3 Value Proposition (single; 3rd option spans 2 cols) */}
                <fieldset className="space-y-sm">
                  <legend className="contents">
                    <span className="block font-label-md text-label-md text-outline uppercase tracking-wider">
                      03. Value Proposition
                    </span>
                    <span className="block font-title-lg text-body-lg font-semibold text-on-surface">
                      What was the most valuable aspect of this summit?
                    </span>
                  </legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {VALUE_PROPOSITION_OPTIONS.map((opt, i) => {
                      const selected = valueProposition === opt.value;
                      const spanFull = i === VALUE_PROPOSITION_OPTIONS.length - 1;
                      return (
                        <label
                          key={opt.value}
                          className={`${CHOICE_BASE} ${spanFull ? 'md:col-span-2' : ''} ${
                            selected ? CHOICE_SELECTED : CHOICE_UNSELECTED
                          }`}
                        >
                          <input
                            className="w-4 h-4 text-primary focus:ring-primary border-outline-variant"
                            name="value_proposition"
                            type="radio"
                            value={opt.value}
                            checked={selected}
                            onChange={() => setValueProposition(opt.value)}
                          />
                          <span className="ml-3 font-body-md text-on-surface">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Q4 Expectations (segmented: selected → primary indigo) */}
                <fieldset className="space-y-sm">
                  <legend className="contents">
                    <span className="block font-label-md text-label-md text-outline uppercase tracking-wider">
                      04. Expectations
                    </span>
                    <span className="block font-title-lg text-body-lg font-semibold text-on-surface">
                      Overall, did the event meet your professional expectations?
                    </span>
                  </legend>
                  <div className="flex items-center w-full border border-outline-variant overflow-hidden pt-1 rounded-full p-1 gap-1">
                    {EXPECTATIONS_OPTIONS.map((opt) => {
                      const selected = expectations === opt.value;
                      return (
                        <label key={opt.value} className="flex-1 text-center cursor-pointer">
                          <input
                            className="sr-only peer"
                            name="expectations"
                            type="radio"
                            value={opt.value}
                            checked={selected}
                            onChange={() => setExpectations(opt.value)}
                          />
                          <div
                            className={`py-2.5 font-body-md transition-all rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-1 ${
                              selected
                                ? 'bg-primary text-on-primary'
                                : 'hover:bg-surface-container-low'
                            }`}
                          >
                            {opt.label}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Q5 Future Preferences (multi) */}
                <fieldset className="space-y-sm">
                  <legend className="contents">
                    <span className="block font-label-md text-label-md text-outline uppercase tracking-wider">
                      05. Future Preferences
                    </span>
                    <span className="block font-title-lg text-body-lg font-semibold text-on-surface">
                      Select areas for future programmatic expansion:
                    </span>
                  </legend>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                    {FUTURE_PREFERENCE_OPTIONS.map((opt) => {
                      const selected = futurePreferences.includes(opt.value);
                      return (
                        <label
                          key={opt.value}
                          className={`${CHOICE_BASE} ${selected ? CHOICE_SELECTED : CHOICE_UNSELECTED}`}
                        >
                          <input
                            className="w-4 h-4 text-primary focus:ring-primary border-outline-variant rounded-full"
                            name="future_preferences"
                            type="checkbox"
                            value={opt.value}
                            checked={selected}
                            onChange={() => toggleFuture(opt.value)}
                          />
                          <span className="ml-3 font-body-md text-on-surface">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                {/* Action area */}
                <div className="pt-lg border-t border-outline-variant flex flex-col sm:flex-row items-center justify-between gap-md">
                  <p className="font-body-md text-on-surface-variant text-sm italic">
                    Approximate completion time: 2 minutes
                  </p>
                  <button
                    type="submit"
                    disabled={state.kind === 'submitting'}
                    className="w-full sm:w-auto bg-primary text-on-primary font-medium text-body-md shadow-sm hover:opacity-90 transition-all rounded-full px-xl py-3 disabled:opacity-50"
                  >
                    {state.kind === 'submitting' ? 'Submitting…' : 'Submit'}
                  </button>
                </div>

                {state.kind === 'error' && (
                  <p
                    role="alert"
                    className="font-body-md text-body-md text-error bg-error-container/20 border border-error-container rounded-lg px-md py-sm flex items-start gap-sm"
                  >
                    <span className="material-symbols-outlined text-[18px] mt-[2px]" aria-hidden>
                      warning
                    </span>
                    <span>{state.message}</span>
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
