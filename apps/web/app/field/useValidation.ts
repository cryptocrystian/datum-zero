"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ValidationReport } from "@/lib/field/validation";
import type { ValidationOutMessage } from "./validation-protocol";

export interface ValidationState {
  report: ValidationReport | null;
  progress: { done: number; total: number } | null;
  running: boolean;
  run: (files: File[], logFile?: File | null) => void;
  reset: () => void;
}

/**
 * Spawns the validation Web Worker and drives it (M1-05). The heavy EXIF parsing + screening happen
 * off the main thread; this hook only ships the files over and receives progress + the final report.
 */
export function useValidation(): ValidationState {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = useCallback((files: File[], logFile?: File | null) => {
    if (files.length === 0) return;
    workerRef.current?.terminate();
    setReport(null);
    setRunning(true);
    setProgress({ done: 0, total: files.length });

    const worker = new Worker(new URL("./validation.worker.ts", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<ValidationOutMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress({ done: msg.done, total: msg.total });
      } else if (msg.type === "done") {
        setReport(msg.report);
        setRunning(false);
        setProgress(null);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setRunning(false);
      setProgress(null);
    };
    worker.postMessage({ files, logFile: logFile ?? null });
  }, []);

  const reset = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setReport(null);
    setProgress(null);
    setRunning(false);
  }, []);

  return { report, progress, running, run, reset };
}
