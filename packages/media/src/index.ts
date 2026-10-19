/**
 * On-device image processing. Runs in the browser before upload, so original
 * photos (with EXIF GPS data and unblurred faces) never leave the phone.
 *
 * Re-encoding through a canvas drops all EXIF/XMP metadata, which is how
 * stripping works here: no metadata parser is needed.
 */

export const MAX_DIMENSION = 1600;
export const TARGET_BYTES = 300 * 1024;

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Scales (width, height) down so the longest side is at most maxDimension. */
export function fitWithin(width: number, height: number, maxDimension = MAX_DIMENSION) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Grows a detected region by a margin so blurs cover hairlines and plate edges. */
export function padRegion(region: Region, imageWidth: number, imageHeight: number, ratio = 0.2): Region {
  const padX = region.width * ratio;
  const padY = region.height * ratio;
  const x = Math.max(0, region.x - padX);
  const y = Math.max(0, region.y - padY);
  return {
    x,
    y,
    width: Math.min(imageWidth - x, region.width + 2 * padX),
    height: Math.min(imageHeight - y, region.height + 2 * padY),
  };
}

/**
 * Detects faces. Wired to MediaPipe Tasks Vision (FaceDetector) in the web app;
 * kept as an injectable function so this package stays dependency-free and testable.
 */
export type FaceDetector = (bitmap: ImageBitmap) => Promise<Region[]>;

export interface ProcessOptions {
  detectFaces?: FaceDetector;
  /** Extra regions the user tapped to blur (number plates, name tags). */
  manualRegions?: Region[];
}

/**
 * Resizes, blurs faces and manual regions, and re-encodes as JPEG under ~300 KB.
 * The returned Blob carries no EXIF metadata.
 */
export async function processImage(file: Blob, options: ProcessOptions = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const scale = width / bitmap.width;
  const detected = options.detectFaces ? await options.detectFaces(bitmap) : [];
  const regions = [...detected, ...(options.manualRegions ?? [])].map((r) =>
    padRegion(
      { x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale },
      width,
      height,
    ),
  );
  for (const r of regions) blurRegion(ctx, canvas, r);
  bitmap.close();

  let quality = 0.82;
  let blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  while (blob.size > TARGET_BYTES && quality > 0.4) {
    quality -= 0.12;
    blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  return blob;
}

function blurRegion(ctx: OffscreenCanvasRenderingContext2D, canvas: OffscreenCanvas, r: Region) {
  // Pixelate first, then blur: a plain blur can sometimes be partially reversed.
  const block = Math.max(8, Math.round(Math.min(r.width, r.height) / 6));
  const small = new OffscreenCanvas(
    Math.max(1, Math.round(r.width / block)),
    Math.max(1, Math.round(r.height / block)),
  );
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, small.width, small.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.filter = "blur(4px)";
  ctx.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, r.width, r.height);
  ctx.restore();
}
