"use client";

import { useEffect, useRef, useState } from "react";
import { useValidation } from "./useValidation";
import { useFieldUpload } from "./useFieldUpload";
import { ValidationResults } from "./ValidationResults";

const IMAGE_EXT = /\.(jpe?g|png|tiff?|dng|webp|heic|heif)$/i;
const LOG_EXT = /\.(txt|csv|log|srt|json|dat|gpx|kml)$/i;
function isImage(f: File): boolean {
  return f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
}
function isLog(f: File): boolean {
  return !isImage(f) && LOG_EXT.test(f.name);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

const MODALITIES = ["DRONE_THERMAL", "DRONE_RGB"] as const;
type Modality = (typeof MODALITIES)[number];

// File System Access API (Chromium) — collect files from a picked set or directory tree.
type FsHandle = { kind: "file" | "directory"; getFile: () => Promise<File>; values: () => AsyncIterable<FsHandle> };
type WindowFSA = Window & {
  showOpenFilePicker?: (opts?: unknown) => Promise<FsHandle[]>;
  showDirectoryPicker?: (opts?: unknown) => Promise<FsHandle>;
};

async function walkDirectory(dir: FsHandle, out: File[]): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      out.push(await entry.getFile());
    } else if (entry.kind === "directory") {
      await walkDirectory(entry, out);
    }
  }
}

export function FileIntake() {
  const [files, setFiles] = useState<File[]>([]);
  const [logFile, setLogFile] = useState<File | null>(null);
  const [modality, setModality] = useState<Modality>("DRONE_THERMAL");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const { report, progress, running, run, reset } = useValidation();
  const upload = useFieldUpload();

  // <input webkitdirectory> isn't a typed React prop — set it imperatively.
  useEffect(() => {
    if (dirInputRef.current) dirInputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  function stage(incoming: File[]) {
    const imgs = incoming.filter(isImage);
    const log = incoming.find(isLog) ?? null;
    if (imgs.length === 0) {
      setNote("No images found in that selection.");
      return;
    }
    reset();
    upload.reset();
    if (log) setLogFile(log);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      const merged = [...prev];
      for (const f of imgs) if (!seen.has(`${f.name}:${f.size}`)) merged.push(f);
      return merged;
    });
    setNote(null);
  }

  async function pickFiles() {
    setNote(null);
    const w = window as WindowFSA;
    if (w.showOpenFilePicker) {
      try {
        setBusy(true);
        const handles = await w.showOpenFilePicker({ multiple: true });
        stage(await Promise.all(handles.map((h) => h.getFile())));
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") filesInputRef.current?.click();
      } finally {
        setBusy(false);
      }
    } else {
      filesInputRef.current?.click();
    }
  }

  async function pickFolder() {
    setNote(null);
    const w = window as WindowFSA;
    if (w.showDirectoryPicker) {
      try {
        setBusy(true);
        const dir = await w.showDirectoryPicker();
        const collected: File[] = [];
        await walkDirectory(dir, collected);
        stage(collected);
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") dirInputRef.current?.click();
      } finally {
        setBusy(false);
      }
    } else {
      dirInputRef.current?.click();
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    stage(Array.from(e.target.files ?? []));
    e.target.value = ""; // allow re-selecting the same set
  }

  function clearSet() {
    setFiles([]);
    setLogFile(null);
    setNote(null);
    reset();
    upload.reset();
  }

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;
  const eligible = report?.summary.eligible ?? 0;
  const busyAny = busy || running || upload.uploading;

  return (
    <div className="flex flex-col gap-3">
      {/* hidden fallbacks for browsers without the File System Access API */}
      <input ref={filesInputRef} type="file" accept="image/*" multiple hidden onChange={onInputChange} />
      <input ref={dirInputRef} type="file" hidden onChange={onInputChange} />

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          disabled={busyAny}
          onClick={pickFolder}
          className="w-full rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-4 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight disabled:opacity-40"
        >
          [ Select Capture Folder ]
        </button>
        <button
          type="button"
          disabled={busyAny}
          onClick={pickFiles}
          className="w-full rounded-sm border border-datum-slate/60 bg-datum-cardbg px-4 py-4 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:border-tactical-gold disabled:opacity-40"
        >
          [ Add Files ]
        </button>
      </div>

      {note ? (
        <p className="rounded-sm border border-datum-slate/40 px-3 py-2 font-mono text-[11px] text-datum-slate">{note}</p>
      ) : null}

      <div className="flex items-center justify-between border-y border-datum-slate/25 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">
          Staged Set{logFile ? " · +LOG" : ""}
        </span>
        <span className="font-mono text-xs text-tactical-gold">
          {String(files.length).padStart(3, "0")} IMG · {humanSize(totalBytes)}
        </span>
      </div>

      {files.length === 0 ? (
        <p className="py-6 text-center font-mono text-[11px] uppercase tracking-wider text-datum-slate">
          No capture set staged
        </p>
      ) : (
        <>
          {/* Modality (sent with each upload for the server-side session record). */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Modality</span>
            <div className="ml-auto flex gap-2">
              {MODALITIES.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={busyAny}
                  onClick={() => setModality(m)}
                  className={
                    "rounded-sm border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors " +
                    (modality === m
                      ? "border-tactical-gold text-tactical-gold"
                      : "border-datum-slate/50 text-datum-slate hover:border-datum-slate")
                  }
                >
                  {m.replace("DRONE_", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Screening runs off the main thread (M1-05 quality + M1-06 hardware). Nothing uploads here. */}
          <button
            type="button"
            disabled={busyAny}
            onClick={() => run(files, logFile)}
            className="w-full rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-3.5 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight disabled:opacity-40"
          >
            {running ? `[ Screening… ${pct}% ]` : "[ Run Screening ]"}
          </button>

          {running && progress ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-datum-slate/25">
              <div className="h-full bg-tactical-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          {report ? (
            <>
              {/* Fail-closed upload: only screening-eligible frames go to the authoritative endpoint. */}
              <button
                type="button"
                disabled={busyAny || eligible === 0}
                onClick={() => upload.upload(files, report, modality)}
                className="w-full rounded-sm border border-status-green/60 bg-datum-midnight px-4 py-3.5 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:bg-status-green hover:text-datum-midnight disabled:opacity-40"
              >
                {upload.uploading
                  ? "[ Uploading… ]"
                  : upload.done
                    ? "[ Upload Complete ]"
                    : `[ Upload ${eligible} Eligible Frame${eligible === 1 ? "" : "s"} ]`}
              </button>
              <p className="font-mono text-[10px] leading-relaxed text-datum-slate">
                Client screening is a pre-check; the ingestion endpoint re-verifies the airframe and
                fails closed. Frames that FAIL screening are never uploaded.
              </p>
              <ValidationResults report={report} uploads={upload.results} />
            </>
          ) : running ? null : (
            <ul className="flex flex-col divide-y divide-datum-slate/15">
              {files.map((f, i) => (
                <li key={`${f.name}:${f.size}:${i}`} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white">{f.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-datum-slate">{humanSize(f.size)}</span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={busyAny}
            onClick={clearSet}
            className="self-start font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-tactical-red disabled:opacity-40"
          >
            [ Clear Set ]
          </button>
        </>
      )}
    </div>
  );
}
