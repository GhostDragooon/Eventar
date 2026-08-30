'use client';

import { Button } from '@/components/ui/button';

export type WizardStep = {
  id: string;
  label: string;
};

type Props = {
  steps: WizardStep[];
  currentIndex: number;
  completedIndexes: number[];
  onStepSelect?: (index: number) => void;
};

/**
 * Completed steps use the success tokens (never primary blue) — primary
 * only marks the step in progress, per the Category 01 colour contract.
 */
export function EventWizardStepIndicator({
  steps,
  currentIndex,
  completedIndexes,
  onStepSelect,
}: Props) {
  return (
    <ol className="flex items-center" aria-label="Event creation steps">
      {steps.map((step, index) => {
        const isCompleted = completedIndexes.includes(index);
        const isCurrent = index === currentIndex;
        const selectable = isCompleted && Boolean(onStepSelect);

        const circleClasses = isCompleted
          ? 'bg-success text-on-success'
          : isCurrent
            ? 'bg-primary text-on-primary'
            : 'bg-surface-container-high text-on-surface-variant';

        const content = (
          <>
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full font-label-md text-label-md ${circleClasses}`}
            >
              {isCompleted ? (
                <span className="material-symbols-outlined text-[16px]" aria-hidden>
                  check
                </span>
              ) : (
                index + 1
              )}
            </span>
            <span
              className={`font-label-md text-label-md ${isCurrent ? 'text-on-surface' : 'text-on-surface-variant'}`}
            >
              {step.label}
            </span>
          </>
        );

        return (
          <li key={step.id} className="flex items-center">
            {selectable ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => onStepSelect?.(index)}
                aria-current={isCurrent ? 'step' : undefined}
                className="flex h-auto items-center gap-sm px-xs py-xs"
              >
                {content}
              </Button>
            ) : (
              <span
                aria-current={isCurrent ? 'step' : undefined}
                className="flex items-center gap-sm px-xs py-xs"
              >
                {content}
              </span>
            )}
            {index < steps.length - 1 && (
              <span className="mx-sm h-px w-8 bg-outline-variant" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
