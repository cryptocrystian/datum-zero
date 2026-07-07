"use client";

import { useEffect, useRef, useState } from "react";
import { useValidation } from "./useValidation";
import { ValidationResults } from "./ValidationResults";

const IMAGE_EXT = /\.(jpe?g|png|tiff?|dng|webp|heic|heif)$/i;
function isImage(f: File): boolean {
  return f.type.startsWith("image/") || IMAGE_EXT.test(f.name);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

// File System Access API (Chromium) — collect images from a picked file set or directory tree.
type FsHandle = { kind: "file" | "directory"; getFile: () => Promise<File>; values: () => AsyncIterable<FsHandle> };
type WindowFSA = Window & {
  showOpenFilePicker?: (opts?: unknown) => Promise<FsHandle[]>;
  showDirectoryPicker?: (opts?: unknown) => Promise<FsHandle>;
};

async function walkDirectory(dir: FsHandle, out: File[]): Promise<void> {
  for await (const entry of dir.values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile();
      if (isImage(file)) out.push(file);
    } else if (entry.kind === "directory") {
      await walkDirectory(entry, out);
    }
  }
}

export function FileIntake() {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const { report, progress, running, run, reset } = useValidation();

  // <input webkitdirectory> isn't a typed React prop — set it imperatively.
  useEffect(() => {
    if (dirInputRef.current) dirInputRef.current.setAttribute("webkitdirectory", "");
  }, []);

  function stage(incoming: File[]) {
    const imgs = incoming.filter(isImage);
    if (imgs.length === 0) {
      setNote("No images found in that selection.");
      return;
    }
    reset();
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

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const pct = progress ? Math.round((progress.done / Math.max(1, progress.total)) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* hidden fallbacks for browsers without the File System Access API */}
      <input ref={filesInputRef} type="file" accept="image/*" multiple hidden onChange={onInputChange} />
      <input ref={dirInputRef} type="file" hidden onChange={onInputChange} />

      <div className="grid grid-cols-1 gap-3">
        <button
          type="button"
          disabled={busy || running}
          onClick={pickFolder}
          className="w-full rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-4 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight disabled:opacity-40"
        >
          [ Select Capture Folder ]
        </button>
        <button
          type="button"
          disabled={busy || running}
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
        <span className="font-mono text-[10px] uppercase tracking-widest text-datum-slate">Staged Set</span>
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
          {/* Run screening off the main thread (M1-05). Nothing is uploaded. */}
          <button
            type="button"
            disabled={running}
            onClick={() => run(files)}
            className="w-full rounded-sm border border-tactical-gold bg-datum-midnight px-4 py-3.5 font-mono text-sm uppercase tracking-wider text-white transition-colors duration-150 hover:bg-tactical-gold hover:text-datum-midnight disabled:opacity-40"
          >
            {running ? `[ Screening… ${pct}% ]` : "[ Run Quality Screening ]"}
          </button>

          {running && progress ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-datum-slate/25">
              <div className="h-full bg-tactical-gold transition-all" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          {report ? (
            <ValidationResults report={report} />
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
            disabled={running}
            onClick={() => {
              setFiles([]);
              setNote(null);
              reset();
            }}
            className="self-start font-mono text-[11px] uppercase tracking-wider text-datum-slate transition-colors hover:text-tactical-red disabled:opacity-40"
          >
            [ Clear Set ]
          </button>
        </>
      )}
    </div>
  );
}
