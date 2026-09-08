import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, resolve } from "node:path";

/* Files live on a mounted volume on the server, served only through an
   authorised route handler — never from /public. Swappable for S3/R2 later
   by reimplementing put/get/remove against the same storageKey contract. */

const ROOT = resolve(process.env.STORAGE_DIR || "/data/storage");

/* 95 MB, not 200: when Cloudflare proxies the domain (orange cloud) it rejects
   request bodies over 100 MB on the Free and Pro plans, before the request ever
   reaches us. Advertising a higher ceiling than the network path allows just
   turns a clear in-app error into an opaque Cloudflare 413.
   Business raises it to 200 MB; DNS-only (grey cloud) removes it entirely. */
export const MAX_FILE_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 95 * 1024 * 1024);

/* The limit that actually binds is on the whole HTTP request, not on any one
   file: 20 files of 95 MB each would pass a per-file check and add up to a
   1.9 GB request. Cloudflare and Caddy would both reject it, but only after
   the client had spent minutes uploading — so cap the sum ourselves and fail
   fast with a message that says why. */
export const MAX_TOTAL_UPLOAD_BYTES = Number(
  process.env.MAX_TOTAL_UPLOAD_BYTES ?? MAX_FILE_BYTES,
);
export const MAX_FILES_PER_UPLOAD = 20;

/** CAD, meshes, drawings, images, docs — what a prototyping studio actually receives. */
export const ALLOWED_EXTENSIONS = new Set([
  ".stl", ".3mf", ".obj", ".step", ".stp", ".iges", ".igs", ".sldprt", ".sldasm",
  ".f3d", ".f3z", ".ipt", ".iam", ".dxf", ".dwg", ".scad", ".gcode", ".3ds", ".ply", ".fbx",
  ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".gif", ".svg",
  ".zip", ".rar", ".7z",
  ".txt", ".md", ".csv", ".xlsx", ".xls", ".docx", ".doc", ".pptx",
  ".mp4", ".mov", ".webm",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".stl": "model/stl",
  ".3mf": "model/3mf",
  ".obj": "model/obj",
  ".step": "model/step",
  ".stp": "model/step",
  ".gcode": "text/x-gcode",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".zip": "application/zip",
};

export function extOf(filename: string): string {
  return extname(filename).toLowerCase();
}

export function isAllowed(filename: string): boolean {
  return ALLOWED_EXTENSIONS.has(extOf(filename));
}

export function guessMime(filename: string, fallback?: string): string {
  return MIME_BY_EXT[extOf(filename)] || fallback || "application/octet-stream";
}

/** Strips path traversal and control characters, keeps the extension. */
export function safeName(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() || "file";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ()\[\]]+/g, "_")
    .replace(/_{2,}/g, "_")
    .slice(-120);
  return cleaned || "file";
}

/** Content-addressed-ish key: scope/yyyy-mm/random-name.ext */
export function makeKey(scope: string, filename: string): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const rand = randomBytes(9).toString("base64url");
  return `${scope}/${month}/${rand}-${safeName(filename)}`;
}

function absolute(key: string): string {
  const p = resolve(ROOT, key);
  if (!p.startsWith(ROOT + "/") && p !== ROOT) throw new Error("storage key escapes root");
  return p;
}

export async function put(key: string, data: Buffer): Promise<{ checksum: string; bytes: number }> {
  const path = absolute(key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  return {
    checksum: createHash("sha256").update(data).digest("hex"),
    bytes: data.byteLength,
  };
}

export async function get(key: string): Promise<Buffer> {
  return readFile(absolute(key));
}

export function stream(key: string) {
  return createReadStream(absolute(key));
}

export async function size(key: string): Promise<number> {
  return (await stat(absolute(key))).size;
}

export async function remove(key: string): Promise<void> {
  try {
    await unlink(absolute(key));
  } catch {
    /* already gone — fine */
  }
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export { ROOT as STORAGE_ROOT };
