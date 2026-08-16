export type OperationState =
  | "idle"
  | "working"
  | "success"
  | "error"
  | "cancelled";

export type OperationResult<T = unknown> =
  | { success: true; data?: T }
  | { success: false; message: string; code?: string };

/** Per-file status used by upload / evidence UI (Category 08). */
export type FileItemStatus =
  | "selected"
  | "uploading"
  | "complete"
  | "error";

export type ComponentPortStatus =
  | "faithful"
  | "adapted"
  | "frontend-shell"
  | "deferred";

export interface ComponentPortRecord {
  sourceIds: readonly string[];
  productionComponent: string;
  status: ComponentPortStatus;
  preservedBehaviours: readonly string[];
  deviations: readonly string[];
  serviceDependencies: readonly string[];
}
