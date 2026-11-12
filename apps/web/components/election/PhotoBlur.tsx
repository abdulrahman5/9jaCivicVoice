"use client";

import { useEffect, useRef } from "react";
import { MAX_DIMENSION, TARGET_BYTES, fitWithin, padRegion, type Region } from "@civicvoice/media";

/**
 * Photos for an election report (task E4), processed on the phone before anything is
 * sent: resized, faces blurred where the browser can detect them, every area the reporter
 * taps blurred (tap again to undo), then re-encoded as JPEG under ~300 KB, which drops
 * all metadata. Same approach as the police form and packages/media.
 */

export interface Photo {
  id: string;
  image: ImageBitmap;
  width: number;
  height: number;
  regions: Region[];
  facesFound: number;
}

interface FaceDetectorLike {
  detect(image: ImageBitmap): Promise<{ boundingBox: DOMRectReadOnly }[]>;
}
declare global {
  interface Window {
    FaceDetector?: new (options?: { fastMode?: boolean }) => FaceDetectorLike;
  }
}

/** Pixelate first, then blur: a plain blur can sometimes be partially reversed. */
function blurArea(ctx: CanvasRenderingContext2D, r: Region) {
  const block = Math.max(8, Math.round(Math.min(r.width, r.height) / 6));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(r.width / block));
  small.height = Math.max(1, Math.round(r.height / block));
  small.getContext("2d")!.drawImage(ctx.canvas, r.x, r.y, r.width, r.height, 0, 0, small.width, small.height);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.filter = "blur(4px)";
  ctx.drawImage(small, 0, 0, small.width, small.height, r.x, r.y, r.width, r.height);
  ctx.restore();
}

function paint(canvas: HTMLCanvasElement, photo: Photo) {
  canvas.width = photo.width;
  canvas.height = photo.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(photo.image, 0, 0, photo.width, photo.height);
  for (const r of photo.regions) blurArea(ctx, r);
}

/** Opens a picked file as a Photo, with any faces the browser finds already blurred. */
export async function openPhoto(file: File): Promise<Photo> {
  const image = await createImageBitmap(file);
  const { width, height } = fitWithin(image.width, image.height, MAX_DIMENSION);
  const regions: Region[] = [];
  if (window.FaceDetector) {
    try {
      const scale = width / image.width;
      for (const face of await new window.FaceDetector({ fastMode: false }).detect(image)) {
        const b = face.boundingBox;
        regions.push(padRegion({ x: b.x * scale, y: b.y * scale, width: b.width * scale, height: b.height * scale }, width, height));
      }
    } catch {
      // No detector on this device: the reporter blurs by tapping.
    }
  }
  return { id: crypto.randomUUID(), image, width, height, regions, facesFound: regions.length };
}

/** The photo as it will be sent: blurred, resized, re-encoded (no metadata), under ~300 KB. */
export async function photoToJpeg(photo: Photo): Promise<Blob> {
  const canvas = document.createElement("canvas");
  paint(canvas, photo);
  for (let quality = 0.82; ; quality -= 0.12) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new Error("Couldn't prepare the photo");
    if (blob.size <= TARGET_BYTES || quality <= 0.4) return blob;
  }
}

export function PhotoEditor({ photo, onChange, onRemove }: { photo: Photo; onChange: (p: Photo) => void; onRemove: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) paint(canvas.current, photo);
  }, [photo]);

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <canvas
        ref={canvas}
        className="h-auto w-full cursor-crosshair rounded-lg"
        style={{ touchAction: "manipulation" }}
        onClick={(e) => {
          const el = e.currentTarget;
          const k = el.width / el.clientWidth;
          const x = e.nativeEvent.offsetX * k;
          const y = e.nativeEvent.offsetY * k;
          const hit = photo.regions.findIndex((r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
          if (hit >= 0) {
            onChange({ ...photo, regions: photo.regions.filter((_, i) => i !== hit) });
          } else {
            const d = Math.min(photo.width, photo.height) * 0.18;
            onChange({ ...photo, regions: [...photo.regions, { x: Math.max(0, x - d / 2), y: Math.max(0, y - d / 2), width: d, height: d }] });
          }
        }}
      />
      <figcaption className="flex items-center justify-between gap-2 text-[13px] text-muted">
        <span>
          {photo.facesFound > 0
            ? `${photo.facesFound} face${photo.facesFound > 1 ? "s" : ""} blurred automatically. Tap anything else to blur it.`
            : "Tap faces, number plates and name tags to blur them. Tap again to undo."}
        </span>
        <button type="button" onClick={onRemove} className="shrink-0 rounded-lg border border-line bg-surface px-3 py-1.5 font-semibold text-ink">
          Remove
        </button>
      </figcaption>
    </figure>
  );
}
