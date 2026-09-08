"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MATERIALS, QUALITY, estimatePrint, type MaterialKey, type QualityKey } from "@/lib/stl";
import { parseStlClient } from "@/lib/stl-client";
import { formatINR } from "@/lib/money";

type Stock = { material: string; spools: number; grams: number; colours: string }[];
type Parsed = { name: string; bytes: number; meta: ReturnType<typeof parseStlClient> };

export default function Estimator({ stock }: { stock: Stock }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<Parsed | null>(null);

  const [material, setMaterial] = useState<MaterialKey>("PLA");
  const [quality, setQuality] = useState<QualityKey>("standard");
  const [infill, setInfill] = useState(20);
  const [copies, setCopies] = useState(1);
  const [scale, setScale] = useState(100);

  const inStock = useMemo(() => {
    const map = new Map(stock.map((s) => [s.material, s]));
    return (m: string) => map.get(m);
  }, [stock]);

  const estimate = useMemo(() => {
    if (!file?.meta) return null;
    return estimatePrint({
      meta: file.meta,
      material,
      quality,
      infillPct: infill,
      copies,
      scalePct: scale,
    });
  }, [file, material, quality, infill, copies, scale]);

  async function load(list: FileList | null) {
    const f = list?.[0];
    if (!f) return;

    if (!/\.stl$/i.test(f.name)) {
      setError("The estimator reads STL files. For STEP, 3MF or anything else, send it over and we'll price it by hand.");
      return;
    }
    if (f.size > 120 * 1024 * 1024) {
      setError("That file is very large for in-browser parsing. Send it to us instead and we'll quote it properly.");
      return;
    }

    setParsing(true);
    setError(null);
    try {
      const meta = parseStlClient(new Uint8Array(await f.arrayBuffer()));
      if (!meta || meta.triangles === 0) {
        setError("We couldn't read that mesh. It may be corrupt — try re-exporting it.");
        setFile(null);
      } else {
        setFile({ name: f.name, bytes: f.size, meta });
      }
    } catch {
      setError("We couldn't read that file.");
    }
    setParsing(false);
  }

  const bbox = file?.meta?.bbox;
  const scaled = bbox
    ? {
        x: Math.round(bbox.x * (scale / 100) * 10) / 10,
        y: Math.round(bbox.y * (scale / 100) * 10) / 10,
        z: Math.round(bbox.z * (scale / 100) * 10) / 10,
      }
    : null;

  // Our largest bed. Anything over this has to be split or printed elsewhere.
  const BED = { x: 350, y: 350, z: 400 };
  const tooBig = scaled ? scaled.x > BED.x || scaled.y > BED.y || scaled.z > BED.z : false;

  return (
    <>
      {!file ? (
        <div className="panel">
          <div
            className={`dropzone ${over ? "is-over" : ""}`}
            style={{ padding: "48px 24px" }}
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
              load(e.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
          >
            {parsing ? (
              "Reading the mesh…"
            ) : (
              <>
                <span style={{ fontSize: 26, display: "block", marginBottom: 12, color: "var(--terra)" }}>⬡</span>
                Drop an STL here, or click to choose one
                <span style={{ display: "block", fontSize: 12.5, marginTop: 8, opacity: 0.75 }}>
                  Parsed in your browser · nothing leaves your machine
                </span>
              </>
            )}
          </div>
          {error ? (
            <div className="notice notice-err" style={{ marginTop: 14 }}>
              {error}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="split">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h3>{file.name}</h3>
                <p className="ph-sub">
                  {file.meta!.triangles.toLocaleString("en-IN")} triangles ·{" "}
                  {file.meta!.watertightHint ? "looks watertight" : "may have holes"}
                </p>
              </div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setFile(null);
                  setError(null);
                }}
              >
                Change file
              </button>
            </div>

            <label className="field">
              <span className="lbl">Material</span>
              <select value={material} onChange={(e) => setMaterial(e.target.value as MaterialKey)}>
                {(Object.keys(MATERIALS) as MaterialKey[]).map((m) => {
                  const s = inStock(m);
                  return (
                    <option key={m} value={m}>
                      {MATERIALS[m].label}
                      {s ? ` — in stock (${s.grams} g)` : stock.length ? " — to order" : ""}
                    </option>
                  );
                })}
              </select>
              {stock.length && !inStock(material) ? (
                <span className="hint">
                  Not on the shelf right now — we&apos;d order it in, which usually adds 2–3 days.
                </span>
              ) : null}
            </label>

            <label className="field">
              <span className="lbl">Layer height</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value as QualityKey)}>
                {(Object.keys(QUALITY) as QualityKey[]).map((q) => (
                  <option key={q} value={q}>
                    {QUALITY[q].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="lbl">Infill — {infill}%</span>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={infill}
                onChange={(e) => setInfill(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--terra)" }}
              />
              <span className="hint">
                {infill <= 15
                  ? "Light — display pieces and mock-ups."
                  : infill <= 35
                    ? "Standard — fine for most functional parts."
                    : infill <= 70
                      ? "Strong — load-bearing brackets and jigs."
                      : "Near-solid — heavy, slow, rarely worth it."}
              </span>
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label className="field">
                <span className="lbl">Copies</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={copies}
                  onChange={(e) => setCopies(Math.max(1, Math.min(999, Number(e.target.value) || 1)))}
                />
              </label>
              <label className="field">
                <span className="lbl">Scale — {scale}%</span>
                <input
                  type="number"
                  min={10}
                  max={400}
                  step={5}
                  value={scale}
                  onChange={(e) => setScale(Math.max(10, Math.min(400, Number(e.target.value) || 100)))}
                />
              </label>
            </div>
          </div>

          <aside className="stack">
            <div className="panel" style={{ borderColor: "color-mix(in srgb, var(--terra) 40%, transparent)" }}>
              <div className="panel-head" style={{ marginBottom: 10 }}>
                <h3>Indicative price</h3>
              </div>
              {estimate ? (
                <>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--terra-deep)", lineHeight: 1.1 }}>
                    {formatINR(estimate.lowPaise)}
                    <span style={{ color: "var(--ink-faint)", fontSize: 20 }}> – </span>
                    {formatINR(estimate.highPaise)}
                  </div>
                  <p style={{ fontSize: 12.5, color: "var(--ink-faint)", margin: "8px 0 18px" }}>
                    for {copies} {copies === 1 ? "piece" : "pieces"}, before GST
                  </p>

                  <dl className="kv" style={{ gridTemplateColumns: "1fr auto", fontSize: 13.5 }}>
                    <dt>Material</dt>
                    <dd style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {estimate.gramsTotal} g
                    </dd>
                    <dt>Print time</dt>
                    <dd style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {estimate.hoursTotal < 1
                        ? `${Math.round(estimate.hoursTotal * 60)} min`
                        : `${estimate.hoursTotal} hr`}
                    </dd>
                    <dt>Volume</dt>
                    <dd style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                      {Math.round(file.meta!.volumeCm3 * (scale / 100) ** 3 * 100) / 100} cm³
                    </dd>
                    {scaled ? (
                      <>
                        <dt>Size</dt>
                        <dd style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                          {scaled.x}×{scaled.y}×{scaled.z} mm
                        </dd>
                      </>
                    ) : null}
                  </dl>
                </>
              ) : null}

              {tooBig ? (
                <div className="notice notice-err" style={{ marginTop: 16 }}>
                  Bigger than our {BED.x}×{BED.y}×{BED.z} mm bed at this scale. We&apos;d split it
                  and bond the parts — send it over and we&apos;ll work out the seams.
                </div>
              ) : null}

              {!file.meta!.watertightHint ? (
                <div className="notice notice-info" style={{ marginTop: 16 }}>
                  This mesh may not be watertight, so the volume — and the price — could be off.
                  We&apos;ll check and repair it before printing.
                </div>
              ) : null}

              <Link className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 18 }} href="/print/">
                Send it for a real quote →
              </Link>
              <p style={{ fontSize: 12, color: "var(--ink-faint)", textAlign: "center", margin: "10px 0 0" }}>
                Supports, finishing and post-processing not included
              </p>
            </div>
          </aside>
        </div>
      )}

      <input ref={inputRef} type="file" accept=".stl" hidden onChange={(e) => load(e.target.files)} />
    </>
  );
}
