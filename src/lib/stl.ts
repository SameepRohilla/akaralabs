/* Reads geometry straight out of an STL so a print request arrives with its
   bounding box, volume and triangle count already known. That's what makes
   an instant estimate — and a sane admin queue — possible without a slicer.

   Written against DataView/Uint8Array rather than node Buffer so the exact
   same code runs in the browser (the /estimate page) and on the server (the
   intake route). If these two ever diverged, a customer would be quoted one
   number and see another — so there is deliberately only one implementation. */

export type StlMeta = {
  format: "binary" | "ascii";
  triangles: number;
  /** mm, assuming the file is in millimetres (the STL convention). */
  bbox: { x: number; y: number; z: number };
  /** cm³ */
  volumeCm3: number;
  /** cm² — used for wall-mass and finishing estimates */
  surfaceCm2: number;
  watertightHint: boolean;
};

const decoder = new TextDecoder("latin1");

export function parseStlBytes(bytes: Uint8Array): StlMeta | null {
  try {
    return looksBinary(bytes) ? parseBinary(bytes) : parseAscii(bytes);
  } catch {
    return null;
  }
}

/** Node-side convenience: a Buffer is already a Uint8Array. */
export function parseStl(buf: Uint8Array): StlMeta | null {
  return parseStlBytes(buf);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function looksBinary(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 84) return false;
  const declared = view(bytes).getUint32(80, true);
  // A binary STL is exactly 84 + 50*n bytes.
  if (84 + declared * 50 === bytes.byteLength) return true;
  const head = decoder.decode(bytes.subarray(0, 512)).trimStart().toLowerCase();
  return !head.startsWith("solid");
}

function parseBinary(bytes: Uint8Array): StlMeta {
  const dv = view(bytes);
  const declared = dv.getUint32(80, true);
  const max = Math.min(declared, Math.floor((bytes.byteLength - 84) / 50));
  const acc = newAcc();

  for (let i = 0; i < max; i++) {
    const o = 84 + i * 50 + 12; // skip the per-facet normal
    addTriangle(
      acc,
      dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true),
      dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true),
      dv.getFloat32(o + 24, true), dv.getFloat32(o + 28, true), dv.getFloat32(o + 32, true),
    );
  }
  return finish(acc, "binary", max);
}

function parseAscii(bytes: Uint8Array): StlMeta {
  const text = decoder.decode(bytes);
  const acc = newAcc();
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  const v: number[] = [];
  let m: RegExpExecArray | null;
  let count = 0;

  while ((m = re.exec(text))) {
    v.push(Number(m[1]), Number(m[2]), Number(m[3]));
    if (v.length === 9) {
      addTriangle(acc, v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
      count++;
      v.length = 0;
    }
  }
  return finish(acc, "ascii", count);
}

type Acc = {
  min: [number, number, number];
  max: [number, number, number];
  vol6: number;
  area2: number;
};

function newAcc(): Acc {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    vol6: 0,
    area2: 0,
  };
}

function addTriangle(
  a: Acc,
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number,
  x3: number, y3: number, z3: number,
) {
  if (x1 < a.min[0]) a.min[0] = x1;
  if (x2 < a.min[0]) a.min[0] = x2;
  if (x3 < a.min[0]) a.min[0] = x3;
  if (y1 < a.min[1]) a.min[1] = y1;
  if (y2 < a.min[1]) a.min[1] = y2;
  if (y3 < a.min[1]) a.min[1] = y3;
  if (z1 < a.min[2]) a.min[2] = z1;
  if (z2 < a.min[2]) a.min[2] = z2;
  if (z3 < a.min[2]) a.min[2] = z3;

  if (x1 > a.max[0]) a.max[0] = x1;
  if (x2 > a.max[0]) a.max[0] = x2;
  if (x3 > a.max[0]) a.max[0] = x3;
  if (y1 > a.max[1]) a.max[1] = y1;
  if (y2 > a.max[1]) a.max[1] = y2;
  if (y3 > a.max[1]) a.max[1] = y3;
  if (z1 > a.max[2]) a.max[2] = z1;
  if (z2 > a.max[2]) a.max[2] = z2;
  if (z3 > a.max[2]) a.max[2] = z3;

  // Signed volume of the tetrahedron to the origin — sums to 6× mesh volume.
  a.vol6 += x1 * (y2 * z3 - y3 * z2) - x2 * (y1 * z3 - y3 * z1) + x3 * (y1 * z2 - y2 * z1);

  // Twice the triangle area, via the cross product.
  const ux = x2 - x1, uy = y2 - y1, uz = z2 - z1;
  const vx = x3 - x1, vy = y3 - y1, vz = z3 - z1;
  const cx = uy * vz - uz * vy;
  const cy = uz * vx - ux * vz;
  const cz = ux * vy - uy * vx;
  a.area2 += Math.sqrt(cx * cx + cy * cy + cz * cz);
}

function finish(a: Acc, format: "binary" | "ascii", triangles: number): StlMeta {
  const dim = (i: number) => (Number.isFinite(a.max[i]) ? round(a.max[i] - a.min[i]) : 0);
  const volumeMm3 = Math.abs(a.vol6) / 6;
  const bboxMm3 = dim(0) * dim(1) * dim(2);

  return {
    format,
    triangles,
    bbox: { x: dim(0), y: dim(1), z: dim(2) },
    volumeCm3: round(volumeMm3 / 1000),
    surfaceCm2: round(a.area2 / 2 / 100),
    // A leaky or self-intersecting mesh usually reports a volume that makes no
    // sense next to its bounding box.
    watertightHint: volumeMm3 > 0 && bboxMm3 > 0 && volumeMm3 <= bboxMm3 * 1.02,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ---- Pricing ---------------------------------------------------------- */

export type MaterialKey = "PLA" | "PETG" | "ABS" | "ASA" | "TPU" | "Nylon" | "CF-Nylon" | "Resin";

/** Density g/cm³ and rate per gram in paise. One place to tune pricing. */
export const MATERIALS: Record<MaterialKey, { density: number; ratePaise: number; label: string }> = {
  PLA: { density: 1.24, ratePaise: 700, label: "PLA — general purpose" },
  PETG: { density: 1.27, ratePaise: 900, label: "PETG — tough, outdoor-ok" },
  ABS: { density: 1.04, ratePaise: 1000, label: "ABS — heat resistant" },
  ASA: { density: 1.07, ratePaise: 1400, label: "ASA — UV stable" },
  TPU: { density: 1.21, ratePaise: 1800, label: "TPU — flexible" },
  Nylon: { density: 1.14, ratePaise: 2200, label: "Nylon — wear resistant" },
  "CF-Nylon": { density: 1.18, ratePaise: 3200, label: "CF-Nylon — stiff, engineering" },
  Resin: { density: 1.12, ratePaise: 2600, label: "Resin — fine detail (SLA)" },
};

export const QUALITY = {
  draft: { layer: 0.28, timeFactor: 0.7, label: "Draft · 0.28 mm" },
  standard: { layer: 0.2, timeFactor: 1, label: "Standard · 0.20 mm" },
  fine: { layer: 0.12, timeFactor: 1.7, label: "Fine · 0.12 mm" },
  ultra: { layer: 0.08, timeFactor: 2.6, label: "Ultra · 0.08 mm" },
} as const;

export type QualityKey = keyof typeof QUALITY;

/** Machine rate and setup, in paise. */
const MACHINE_PAISE_PER_HOUR = 6000; // ₹60/hr — machine amortisation plus power
const SETUP_PAISE = 15000; // ₹150/job — slicing, plate prep, removal
const FLOW_CM3_PER_HOUR = 11; // extruded volume at standard quality
const WALL_MM = 1.2;

/** Indicative estimate. Deliberately conservative and returned as a band —
    a single figure would imply precision we don't have before seeing the part. */
export function estimatePrint(input: {
  meta: Pick<StlMeta, "volumeCm3" | "surfaceCm2">;
  material: MaterialKey;
  quality: QualityKey;
  infillPct: number;
  copies: number;
  scalePct?: number;
}) {
  const scale = (input.scalePct ?? 100) / 100;
  const solidCm3 = Math.max(input.meta.volumeCm3 * scale ** 3, 0.01);

  // Wall mass: surface area × wall thickness, capped so thin parts don't end
  // up "thicker than solid".
  const shellCm3 = Math.min(input.meta.surfaceCm2 * scale ** 2 * (WALL_MM / 10), solidCm3 * 0.9);
  const infillCm3 = Math.max(solidCm3 - shellCm3, 0) * (Math.max(0, Math.min(input.infillPct, 100)) / 100);
  const usedCm3 = shellCm3 + infillCm3;

  const mat = MATERIALS[input.material];
  const grams = usedCm3 * mat.density;
  const materialPaise = Math.round(grams * mat.ratePaise);

  const hours = (usedCm3 / FLOW_CM3_PER_HOUR) * QUALITY[input.quality].timeFactor;
  const machinePaise = Math.round(hours * MACHINE_PAISE_PER_HOUR);

  const copies = Math.max(1, Math.min(Math.round(input.copies) || 1, 999));
  const perCopyPaise = materialPaise + machinePaise;
  // Batch relief: extra copies share the setup and the handling.
  const subtotalPaise = Math.round(SETUP_PAISE + perCopyPaise * copies * (copies > 1 ? 0.92 : 1));

  return {
    grams: Math.round(grams * 10) / 10,
    gramsTotal: Math.round(grams * copies * 10) / 10,
    hours: Math.round(hours * 100) / 100,
    hoursTotal: Math.round(hours * copies * 100) / 100,
    materialPaise,
    machinePaise,
    setupPaise: SETUP_PAISE,
    perCopyPaise,
    subtotalPaise,
    lowPaise: Math.round(subtotalPaise * 0.85),
    highPaise: Math.round(subtotalPaise * 1.3),
  };
}
