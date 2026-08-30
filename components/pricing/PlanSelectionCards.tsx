import { cn } from '@/lib/utils';

export type PlanOption = { id: string; name: string; description: string; priceLabel: string; badge?: string };

export function PlanSelectionCards({
  plans,
  value,
  onChange,
}: {
  plans: readonly PlanOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="font-title-lg text-title-lg text-on-surface">Select a package</legend>
      <div className="mt-md grid gap-md">
        {plans.map((plan) => {
          const selected = plan.id === value;
          return (
            <label
              key={plan.id}
              className={cn(
                'flex cursor-pointer gap-md rounded-[20px] border p-lg',
                selected ? 'border-primary bg-primary-container text-on-primary-container' : 'border-outline-variant bg-surface-container-lowest text-on-surface',
              )}
            >
              <input type="radio" name="plan" value={plan.id} checked={selected} onChange={() => onChange(plan.id)} className="mt-xs size-5 accent-primary" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-xs">
                  <strong className="font-title-lg text-title-lg">{plan.name}</strong>
                  {plan.badge && (
                    <span className={cn('rounded-full px-sm py-xs font-label-md text-label-md', selected ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant')}>
                      {plan.badge}
                    </span>
                  )}
                </span>
                <small className={cn('mt-xs block', selected ? 'text-on-primary-container' : 'text-on-surface-variant')}>{plan.description}</small>
              </span>
              <strong className="shrink-0">{plan.priceLabel}</strong>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
