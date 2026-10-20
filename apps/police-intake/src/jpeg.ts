/**
 * Server-side metadata strip for police photos. The form already re-encodes photos
 * through a canvas (which drops metadata), but the Worker can't trust the client, so it
 * also removes every APP1-APP15 segment (EXIF, GPS, XMP, ICC, maker notes) and comments.
 * Image data is copied unchanged. Returns null for anything that isn't a well-formed JPEG.
 */

export const MAX_PHOTO_BYTES = 400 * 1024;

export function stripJpegMetadata(input: Uint8Array): Uint8Array | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  const out: Uint8Array[] = [input.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= input.length) {
    if (input[i] !== 0xff) return null;
    const marker = input[i + 1]!;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    const length = (input[i + 2]! << 8) | input[i + 3]!;
    if (length < 2 || i + 2 + length > input.length) return null;
    const segment = input.subarray(i, i + 2 + length);
    if (marker === 0xda) {
      // Start of scan: the compressed image follows, up to the end of the file.
      out.push(input.subarray(i));
      return concat(out);
    }
    const isAppN = marker >= 0xe1 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isAppN && !isComment) out.push(segment);
    i += 2 + length;
  }
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}
