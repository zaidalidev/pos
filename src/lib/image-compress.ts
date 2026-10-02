/** Compress product photos before they hit localStorage / future Supabase Storage. */

const MAX_EDGE = 720;
const JPEG_QUALITY = 0.72;
/** Soft target — if still huge after compress, caller can reject. */
export const MAX_COMPRESSED_CHARS = 120_000;
const LOGO_MAX_EDGE = 256;
const LOGO_MAX_CHARS = 48_000;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image"));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize + JPEG-encode an image file to a small data URL.
 * Keeps localStorage (and later Supabase egress) small.
 */
export async function compressImageFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  const raw = await readFileAsDataUrl(file);
  // Already tiny (icons) — keep as-is
  if (raw.length < 40_000 && file.type === "image/jpeg") return raw;

  const img = await loadImage(raw);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw.slice(0, MAX_COMPRESSED_CHARS);
  ctx.drawImage(img, 0, 0, w, h);

  let quality = JPEG_QUALITY;
  let out = canvas.toDataURL("image/jpeg", quality);
  while (out.length > MAX_COMPRESSED_CHARS && quality > 0.4) {
    quality -= 0.1;
    out = canvas.toDataURL("image/jpeg", quality);
  }
  if (out.length > MAX_COMPRESSED_CHARS) {
    // Last resort: smaller canvas
    const w2 = Math.round(w * 0.6);
    const h2 = Math.round(h * 0.6);
    canvas.width = w2;
    canvas.height = h2;
    ctx.drawImage(img, 0, 0, w2, h2);
    out = canvas.toDataURL("image/jpeg", 0.55);
  }
  return out;
}

/** Smaller target for shop logo (sidebar, invoice, favicon). Always PNG — JPEG kills transparency (white box). */
export async function compressLogoFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  const raw = await readFileAsDataUrl(file);
  if (raw.length < 25_000 && file.type === "image/png") return raw;

  const img = await loadImage(raw);
  const scale = Math.min(1, LOGO_MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw.slice(0, LOGO_MAX_CHARS);
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  let out = canvas.toDataURL("image/png");
  if (out.length > LOGO_MAX_CHARS) {
    const w2 = Math.max(1, Math.round(w * 0.7));
    const h2 = Math.max(1, Math.round(h * 0.7));
    canvas.width = w2;
    canvas.height = h2;
    ctx.clearRect(0, 0, w2, h2);
    ctx.drawImage(img, 0, 0, w2, h2);
    out = canvas.toDataURL("image/png");
  }
  if (out.length > LOGO_MAX_CHARS) throw new Error("Logo is too large — try a smaller image.");
  return out;
}
