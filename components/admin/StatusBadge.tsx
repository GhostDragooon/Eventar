import { cn } from '@/lib/utils';

export type RecordStatus = 'active' | 'invited' | 'inactive' | 'restricted';

const styles: Record<RecordStatus, string> = {
  active: 'bg-success-container text-on-success-container',
  invited: 'bg-primary-container text-on-primary-container',
  inactive: 'bg-surface-container-high text-on-surface-variant',
  restricted: 'bg-error-container text-on-error-container',
};

export function StatusBadge({ status }: { status: RecordStatus }) {
  return (
    <span className={cn('inline-flex rounded-full px-sm py-xs font-label-md text-label-md capitalize', styles[status])}>
      {status}
    </span>
  );
}
