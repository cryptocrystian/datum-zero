"use client";

import { useCallback, useState } from "react";
import type { ValidationReport } from "@/lib/field/validation";

export type UploadStatus = "SKIPPED" | "UPLOADING" | "INGESTED" | "REJECTED" | "ERROR";
export interface UploadItem {
  name: string;
  status: UploadStatus;
  message: string;
}
export interface FieldUploadState {
  results: Record<string, UploadItem>;
  uploading: boolean;
  done: boolean;
  upload: (files: File[], report: ValidationReport, modality: string) => Promise<void>;
  reset: () => void;
}

/**
 * Fail-closed field upload (M1-06). Layer 1 (client): ONLY frames that passed screening
 * (`uploadEligible` — no FAIL) are sent; a FAIL'd frame is never uploaded. Layer 2 (server): the
 * authoritative gate at /api/v1/ingestion/upload re-binds the airframe and returns 422 on
 * NO_MATCH / NOT_VERIFIED (CR-11). Uploads go ONLY through that authenticated endpoint.
 */
export function useFieldUpload(): FieldUploadState {
  const [results, setResults] = useState<Record<string, UploadItem>>({});
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);

  const upload = useCallback(async (files: File[], report: ValidationReport, modality: string) => {
    setUploading(true);
    setDone(false);
    const byName = new Map(report.files.map((f) => [f.name, f]));
    const acc: Record<string, UploadItem> = {};
    const set = (name: string, item: UploadItem) => {
      acc[name] = item;
      setResults({ ...acc });
    };

    for (const file of files) {
      const fr = byName.get(file.name);
      // FAIL-CLOSED client gate: a non-eligible (FAIL'd) frame NEVER uploads.
      if (!fr || !fr.uploadEligible) {
        set(file.name, { name: file.name, status: "SKIPPED", message: "Screening FAIL — held back from upload." });
        continue;
      }
      set(file.name, { name: file.name, status: "UPLOADING", message: "Uploading…" });
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("modality", modality);
        fd.append("airframeSerial", fr.serial ?? "");
        if (fr.capturedAt != null) fd.append("capturedAt", new Date(fr.capturedAt).toISOString());
        const res = await fetch("/api/v1/ingestion/upload", { method: "POST", body: fd, credentials: "same-origin" });
        const data = (await res.json().catch(() => ({}))) as { ingestionSessionId?: string; message?: string };
        if (res.status === 201) {
          set(file.name, { name: file.name, status: "INGESTED", message: `Ingested · session ${String(data.ingestionSessionId ?? "").slice(0, 8)}` });
        } else if (res.status === 422) {
          set(file.name, { name: file.name, status: "REJECTED", message: data.message || "Airframe not verified — server rejected (fail closed)." });
        } else {
          set(file.name, { name: file.name, status: "ERROR", message: data.message || `Upload failed (HTTP ${res.status}).` });
        }
      } catch {
        set(file.name, { name: file.name, status: "ERROR", message: "Upload failed — network error." });
      }
    }
    setUploading(false);
    setDone(true);
  }, []);

  const reset = useCallback(() => {
    setResults({});
    setUploading(false);
    setDone(false);
  }, []);

  return { results, uploading, done, upload, reset };
}
