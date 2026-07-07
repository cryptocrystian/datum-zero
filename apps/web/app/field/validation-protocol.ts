import type { ValidationReport } from "@/lib/field/validation";

// Message contract between the field UI and the validation Web Worker (M1-05/M1-06). Framework-free.
// `logFile` is an OPTIONAL uploaded flight log for the telemetry-serial cross-check (never live).
export type ValidationInMessage = { files: File[]; logFile?: File | null };
export type ValidationOutMessage =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; report: ValidationReport };
