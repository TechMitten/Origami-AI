/**
 * Image format conversion, entirely on the main thread via <canvas>.
 *
 * Deliberately does NOT touch FFmpeg. Every browser that can run this app can
 * decode PNG/JPEG/WebP/GIF/BMP/AVIF and encode PNG/JPEG/WebP natively, so a
 * PNG -> WebP conversion is instant and needs no download at all. Pulling in the
 * ~32MB wasm core to also offer BMP/TIFF output would trade that away for
 * formats nobody asks a browser for. `convertImage` is kept narrow enough that
 * an FFmpeg-backed path can be slotted in later behind the same signature.
 *
 * Note that the canvas round-trip drops all metadata (EXIF, GPS, ICC). For this
 * app that is a feature worth advertising, not a caveat to bury.
 */

export type ImageTargetId = 'webp' | 'jpeg' | 'png' | 'avif';

export interface ImageTarget {
  id: ImageTargetId;
  label: string;
  mime: string;
  /** Includes the dot, e.g. '.webp'. */
  extension: string;
  /** Whether the `quality` option means anything for this encoder. */
  lossy: boolean;
  /** No alpha channel, so the canvas must be filled before drawing. */
  opaque: boolean;
  /** One-line "when to pick this" shown under the chip row. */
  blurb: string;
}

export const IMAGE_TARGETS: readonly ImageTarget[] = [
  {
    id: 'webp',
    label: 'WebP',
    mime: 'image/webp',
    extension: '.webp',
    lossy: true,
    opaque: false,
    blurb: 'Best all-rounder for the web — keeps transparency, typically 25-80% smaller than PNG or JPEG.',
  },
  {
    id: 'jpeg',
    label: 'JPEG',
    mime: 'image/jpeg',
    extension: '.jpg',
    lossy: true,
    opaque: true,
    blurb: 'Universal support for photos. No transparency, so transparent areas are filled with the background colour.',
  },
  {
    id: 'png',
    label: 'PNG',
    mime: 'image/png',
    extension: '.png',
    lossy: false,
    opaque: false,
    blurb: 'Lossless with transparency. Ideal for logos, screenshots and line art.',
  },
  {
    id: 'avif',
    label: 'AVIF',
    mime: 'image/avif',
    extension: '.avif',
    lossy: true,
    opaque: false,
    blurb: 'Smallest files of the four, but no shipping browser exposes an AVIF encoder to canvas yet.',
  },
] as const;

/** Extensions the browser can generally decode. Used for the drop-zone hint. */
export const IMAGE_INPUT_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif', '.svg', '.ico', '.heic', '.heif', '.tif', '.tiff',
];

/** `accept` map for react-dropzone. */
export const IMAGE_DROPZONE_ACCEPT: Record<string, string[]> = {
  'image/*': [...IMAGE_INPUT_EXTENSIONS],
};

export function looksLikeImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  const name = file.name.toLowerCase();
  return IMAGE_INPUT_EXTENSIONS.some((ext) => name.endsWith(ext));
}

/**
 * `toDataURL`/`toBlob` both fall back to PNG *silently* when asked for a MIME
 * type the browser cannot encode, so the only honest test is to ask for one
 * and check what came back. `toDataURL` is used rather than `toBlob` because it
 * is synchronous, which lets the format chips render without a loading state.
 */
function probeEncoder(mime: string): boolean {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL(mime).startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

let supportedTargets: readonly ImageTarget[] | null = null;

/** Encoder support varies per browser, so probe once and memoize. */
export function getSupportedImageTargets(): readonly ImageTarget[] {
  if (!supportedTargets) {
    supportedTargets = IMAGE_TARGETS.filter((target) => probeEncoder(target.mime));
  }
  return supportedTargets;
}

export interface ImageConvertOptions {
  /** 0..1. Ignored by the PNG encoder, which is lossless. */
  quality?: number;
  /** Painted behind the image for targets with no alpha channel. */
  backgroundColor?: string;
}

export interface ImageConvertResult {
  blob: Blob;
  width: number;
  height: number;
  /** The source held more than one frame and only the first was converted. */
  truncatedAnimation: boolean;
}

export class ImageConvertError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageConvertError';
  }
}

function isSvg(file: File): boolean {
  return file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
}

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(dot).toLowerCase() : '';
}

/** ASCII needle search over a byte window. */
function indexOfAscii(bytes: Uint8Array, needle: string): number {
  const target = new Uint8Array(needle.length);
  for (let i = 0; i < needle.length; i++) target[i] = needle.charCodeAt(i);
  outer: for (let i = 0; i <= bytes.length - target.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (bytes[i + j] !== target[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/**
 * Cheap header sniff for multi-frame sources. `createImageBitmap` only ever
 * hands back frame one, so silently flattening a 3-second animation into a
 * still is something the user has to be told about.
 *
 * Only the first couple of megabytes are inspected: every marker checked here
 * (GIF's NETSCAPE2.0 loop extension, WebP's ANIM chunk, PNG's acTL) lives in the
 * file header by specification.
 */
async function hasMultipleFrames(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer());
    if (indexOfAscii(head, 'GIF8') === 0) {
      if (indexOfAscii(head, 'NETSCAPE2.0') !== -1) return true;
      // Fall back to counting graphic-control-extension blocks (0x21 0xF9 0x04).
      let count = 0;
      for (let i = 0; i < head.length - 2; i++) {
        if (head[i] === 0x21 && head[i + 1] === 0xf9 && head[i + 2] === 0x04) {
          count++;
          if (count > 1) return true;
        }
      }
      return false;
    }
    if (indexOfAscii(head, 'WEBP') === 8) return indexOfAscii(head, 'ANIM') !== -1;
    if (head[0] === 0x89 && indexOfAscii(head, 'PNG') === 1) return indexOfAscii(head, 'acTL') !== -1;
    return false;
  } catch {
    return false;
  }
}

interface DecodedSource {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Rasterize an SVG through an <img>. `createImageBitmap` rejects SVG blobs in
 * Chrome and Firefox, so this path is required rather than merely a fallback.
 * A blob-URL SVG in an <img> cannot run script and does not taint the canvas.
 */
async function decodeViaImgElement(file: File): Promise<DecodedSource> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'sync';
  img.src = url;

  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e instanceof Error ? e : new Error(String(e));
  }

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // A viewBox-only SVG has no intrinsic size; recover the aspect ratio from the
  // markup and normalise the long edge so the output is not a 0x0 canvas.
  if ((!width || !height) && isSvg(file)) {
    const text = await file.text();
    const viewBox = /viewBox\s*=\s*["']\s*[-\d.]+[,\s]+[-\d.]+[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(text);
    const ratio = viewBox ? Number(viewBox[1]) / Number(viewBox[2]) : 1;
    const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
    if (safeRatio >= 1) {
      width = 1024;
      height = Math.round(1024 / safeRatio);
    } else {
      height = 1024;
      width = Math.round(1024 * safeRatio);
    }
  }

  if (!width || !height) {
    URL.revokeObjectURL(url);
    throw new ImageConvertError('That image reports a size of zero, so there is nothing to convert.');
  }

  return { source: img, width, height, release: () => URL.revokeObjectURL(url) };
}

async function decodeImage(file: File): Promise<DecodedSource> {
  if (!isSvg(file)) {
    try {
      // 'from-image' is explicit on purpose: without it, EXIF-rotated phone
      // photos come out of the canvas sideways.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to the <img> path, which covers formats the ImageBitmap
      // decoder declines but the image pipeline still understands.
    }
  }

  try {
    return await decodeViaImgElement(file);
  } catch (e) {
    if (e instanceof ImageConvertError) throw e;
    const ext = extensionOf(file) || 'that file';
    throw new ImageConvertError(
      `Your browser can't read ${ext}. Supported here: PNG, JPG, WebP, GIF, BMP, AVIF and SVG.`,
    );
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(
            new ImageConvertError(
              "This image is too large for your browser's canvas limit, so it can't be converted here.",
            ),
          );
          return;
        }
        resolve(blob);
      },
      mime,
      quality,
    );
  });
}

export async function convertImage(
  file: File,
  target: ImageTarget,
  options: ImageConvertOptions = {},
): Promise<ImageConvertResult> {
  const { quality = 0.82, backgroundColor = '#ffffff' } = options;

  const truncatedAnimation = await hasMultipleFrames(file);
  const decoded = await decodeImage(file);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ImageConvertError('Your browser refused to open a 2D canvas, so conversion is unavailable.');

    // Without this fill, a transparent PNG converted to JPEG comes out with a
    // black background rather than a white one.
    if (target.opaque) {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(
      canvas,
      target.mime,
      target.lossy ? Math.min(1, Math.max(0.05, quality)) : undefined,
    );

    // Belt and braces: the encoder is supposed to have been probed already, but
    // a silent PNG fallback here would hand the user a mislabelled file.
    if (blob.type !== target.mime) {
      throw new ImageConvertError(`Your browser can't encode ${target.label}. Pick a different output format.`);
    }

    return { blob, width: canvas.width, height: canvas.height, truncatedAnimation };
  } finally {
    decoded.release();
  }
}

/** Swap a filename's extension for the target's, e.g. 'shot.png' -> 'shot.webp'. */
export function outputFilename(originalName: string, extension: string): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  return `${base}${extension}`;
}
