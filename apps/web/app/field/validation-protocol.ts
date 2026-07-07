import type { ValidationReport } from "@/lib/field/validation";

// Message contract between the field UI and the validation Web Worker (M1-05). Shared, framework-free.
export type ValidationInMessage = { files: File[] };
export type ValidationOutMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; report: ValidationReport };
