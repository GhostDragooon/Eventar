import { cn } from '@/lib/utils';

export type ActionItem = { id: string; label: string; icon: string; disabled?: boolean };

type Props = {
  actions: readonly ActionItem[];
  onAction: (id: string) => void;
  label?: string;
};

export function ActionGroup({ actions, onAction, label = 'Actions' }: Props) {
  return (
    <div
      className="inline-flex overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest"
      role="group"
      aria-label={label}
    >
      {actions.map((action, index) => (
        <button
          key={action.id}
          type="button"
          disabled={action.disabled}
          onClick={() => onAction(action.id)}
          className={cn(
            'min-h-11 border-outline-variant px-md font-label-md text-label-md text-on-surface hover:bg-surface-container focus:z-10 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50',
            index > 0 && 'border-l',
          )}
        >
          <span className="material-symbols-outlined mr-xs align-middle text-[18px]" aria-hidden>
            {action.icon}
          </span>
          {action.label}
        </button>
      ))}
    </div>
  );
}
