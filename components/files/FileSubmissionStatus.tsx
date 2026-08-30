/**
 * BLOCK-ARCHITECTURE GATED — see UploadActionButton.tsx header. Library-only
 * until B6 (Stage 13).
 */

export type FileSubmissionState = 'selected' | 'uploading' | 'accepted' | 'rejected';

const CONFIG = {
  selected: ['description', 'bg-surface-container-high text-on-surface-variant', 'Selected'],
  uploading: ['progress_activity', 'bg-primary-container text-on-primary-container', 'Uploading'],
  accepted: ['check_circle', 'bg-success-container text-on-success-container', 'Accepted'],
  rejected: ['error', 'bg-error-container text-on-error-container', 'Rejected'],
} as const;

export function FileSubmissionStatus({ state, message }: { state: FileSubmissionState; message?: string }) {
  const [icon, style, label] = CONFIG[state];
  return (
    <div role={state === 'rejected' ? 'alert' : 'status'} className={`flex items-start gap-sm rounded-[12px] p-md ${style}`}>
      <span className="material-symbols-outlined" aria-hidden>{icon}</span>
      <span>
        <strong className="block">{label}</strong>
        {message && <span>{message}</span>}
      </span>
    </div>
  );
}
