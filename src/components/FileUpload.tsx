"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

/** Drop-zone that posts straight to our own server, so the old 5 MB email
    attachment ceiling is gone — a 180 MB STEP assembly goes through fine. */
export default function FileUpload({
  reference,
  asStudio,
  label,
}: {
  reference: string;
  asStudio?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    setProgress(0);

    const fd = new FormData();
    for (const f of Array.from(list)) fd.append("files", f, f.name);
    if (asStudio) fd.append("asStudio", "1");

    // XHR rather than fetch: a 200 MB CAD upload needs a real progress bar.
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/requests/${reference}/files`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const body = safeJson(xhr.responseText);
          if (body?.rejected?.length) setError(`Not accepted: ${body.rejected.join(", ")}`);
          router.refresh();
        } else {
          setError(safeJson(xhr.responseText)?.error || "Upload failed. Try again.");
        }
        resolve();
      };
      xhr.onerror = () => {
        setError("Upload failed — check your connection and try again.");
        resolve();
      };
      xhr.send(fd);
    });

    setBusy(false);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <>
      <div
        className={`dropzone ${over ? "is-over" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        {busy ? (
          <>
            <div style={{ marginBottom: 10 }}>Uploading… {progress}%</div>
            <div style={{ height: 3, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ width: `${progress}%`, height: "100%", background: "var(--grad-saffron)" }} />
            </div>
          </>
        ) : (
          <>
            {label || (asStudio ? "Add photos or files for the customer" : "Add a file — STL, STEP, PDF, photos")}
            <span style={{ display: "block", fontSize: 12, marginTop: 6, opacity: 0.7 }}>
              Drop here or click to browse · up to 200 MB each
            </span>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => upload(e.target.files)}
      />

      {error ? (
        <div className="notice notice-err" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </>
  );
}

function safeJson(text: string): { error?: string; rejected?: string[] } | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
