/**
 * Composites an AI-generated background image with a title/bullets text overlay into a
 * single flattened PNG, the same way a PDF page render is one flattened image with its
 * visible text baked in (see pdfService.ts). AI image models render on-image text poorly,
 * so the background is decorative only and the actual slide content is drawn with canvas
 * text APIs on top of it.
 */

export interface SlideDimensions {
  width: number;
  height: number;
}

/** Fixed at 16:9 for v1 — the app's aspectRatio state (App.tsx) has no user-facing picker yet. */
export const slideDimensionsFor = (): SlideDimensions => ({ width: 1920, height: 1080 });

const loadImageFromBlob = (blob: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load generated background image.'));
    };
    img.src = url;
  });

const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
};

const drawSlideText = (ctx: CanvasRenderingContext2D, title: string, bullets: string[], dims: SlideDimensions) => {
  const { width, height } = dims;
  const paddingX = width * 0.07;
  let cursorY = height * 0.28;

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(height * 0.075)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  for (const line of wrapText(ctx, title, width * 0.55)) {
    ctx.fillText(line, paddingX, cursorY);
    cursorY += height * 0.09;
  }

  cursorY += height * 0.03;
  ctx.font = `400 ${Math.round(height * 0.038)}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  for (const bullet of bullets) {
    for (const line of wrapText(ctx, `•  ${bullet}`, width * 0.5)) {
      ctx.fillText(line, paddingX, cursorY);
      cursorY += height * 0.055;
    }
    cursorY += height * 0.015;
  }
};

const slideText = (title: string, bullets: string[]): string => [title, ...bullets].join('\n');

const newCanvas = (dims: SlideDimensions): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
  const canvas = document.createElement('canvas');
  canvas.width = dims.width;
  canvas.height = dims.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  return { canvas, ctx };
};

/** Composites a Pollinations-generated background with the slide's title/bullets on top. */
export async function composeSlideImage(
  background: Blob,
  title: string,
  bullets: string[],
  dims: SlideDimensions,
): Promise<{ dataUrl: string; text: string }> {
  const { canvas, ctx } = newCanvas(dims);
  const { width, height } = dims;

  const img = await loadImageFromBlob(background);
  try {
    // Cover-fit the background image into the canvas.
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const drawW = img.naturalWidth * scale;
    const drawH = img.naturalHeight * scale;
    ctx.drawImage(img, (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
  } finally {
    URL.revokeObjectURL(img.src);
  }

  // Legibility scrim over the left/upper portion where the text sits.
  const gradient = ctx.createLinearGradient(0, 0, width * 0.75, 0);
  gradient.addColorStop(0, 'rgba(10, 12, 16, 0.88)');
  gradient.addColorStop(1, 'rgba(10, 12, 16, 0.05)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawSlideText(ctx, title, bullets, dims);

  return { dataUrl: canvas.toDataURL('image/png'), text: slideText(title, bullets) };
}

/** Used when the background image failed to generate — a plain gradient stands in for it. */
export async function composeSlidePlaceholder(
  title: string,
  bullets: string[],
  dims: SlideDimensions,
): Promise<{ dataUrl: string; text: string }> {
  const { canvas, ctx } = newCanvas(dims);
  const { width, height } = dims;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#1e2530');
  gradient.addColorStop(1, '#0a0c10');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawSlideText(ctx, title, bullets, dims);

  return { dataUrl: canvas.toDataURL('image/png'), text: slideText(title, bullets) };
}
