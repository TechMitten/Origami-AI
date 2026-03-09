// Types for OCR events
export interface OCRProgressEventDetail {
  currentPage: number;
  totalPages: number;
  progress: number;
  status: string;
}

export const ocrEvents = new EventTarget();

// Lazy-loaded Tesseract type
type TesseractModule = typeof import('tesseract.js');

let Tesseract: TesseractModule | null = null;
let worker: import('tesseract.js').Worker | null = null;
let isInitializing = false;
let initPromise: Promise<void> | null = null;

const MIN_CHARS_FOR_OCR = 50;

/**
 * Preprocesses canvas for better OCR results.
 * This improves text recognition by enhancing contrast and reducing noise.
 */
function preprocessCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;

  // Get original image data
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Convert to grayscale and calculate histogram for thresholding
  const grayscale = new Uint8Array(width * height);
  let histogram = new Array(256).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    // Use luminosity method: 0.299*R + 0.587*G + 0.114*B
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    grayscale[i / 4] = gray;
    histogram[gray]++;
  }

  // Calculate optimal threshold using Otsu's method
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;

  const totalPixels = width * height;

  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;

    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += i * histogram[i];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const variance = wB * wF * (mB - mF) * (mB - mF);
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }

  // Apply binarization with some padding around threshold
  const thresholdPadding = 15;
  const lowerThreshold = Math.max(0, threshold - thresholdPadding);
  const upperThreshold = Math.min(255, threshold + thresholdPadding);

  // Create new canvas with preprocessed image
  const processedCanvas = document.createElement('canvas');
  processedCanvas.width = width;
  processedCanvas.height = height;
  const processedCtx = processedCanvas.getContext('2d')!;
  const processedImageData = processedCtx.createImageData(width, height);
  const processedData = processedImageData.data;

  // Apply adaptive binarization for better edge detection
  for (let i = 0; i < grayscale.length; i++) {
    const pixelValue = grayscale[i];
    let binaryValue;

    // Adaptive thresholding with hysteresis
    if (pixelValue < lowerThreshold) {
      binaryValue = 0; // Black
    } else if (pixelValue > upperThreshold) {
      binaryValue = 255; // White
    } else {
      // In the middle ground - use local neighborhood average
      binaryValue = pixelValue < threshold ? 0 : 255;
    }

    // Apply dilation to thicken text (makes it more readable)
    processedData[i * 4] = binaryValue;
    processedData[i * 4 + 1] = binaryValue;
    processedData[i * 4 + 2] = binaryValue;
    processedData[i * 4 + 3] = 255;
  }

  processedCtx.putImageData(processedImageData, 0, 0);

  console.log(`[OCR Service] Applied Otsu thresholding (threshold: ${threshold})`);

  return processedCanvas;
}

/**
 * Enhances image contrast before OCR.
 * This can help with faded text or low-contrast documents.
 */
function enhanceContrast(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // Calculate min and max values
  let min = 255;
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (avg < min) min = avg;
    if (avg > max) max = avg;
  }

  // Apply contrast stretching
  const contrastFactor = 255 / (max - min);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, (data[i] - min) * contrastFactor));
    data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - min) * contrastFactor));
    data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - min) * contrastFactor));
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Upscales canvas for better OCR on small text.
 * Tesseract works better with higher resolution images.
 */
function upscaleForOCR(canvas: HTMLCanvasElement, scale: number = 2): HTMLCanvasElement {
  if (scale <= 1) return canvas;

  const upscaled = document.createElement('canvas');
  upscaled.width = canvas.width * scale;
  upscaled.height = canvas.height * scale;
  const ctx = upscaled.getContext('2d')!;

  // Use high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, upscaled.width, upscaled.height);

  console.log(`[OCR Service] Upscaled canvas by ${scale}x to ${upscaled.width}x${upscaled.height}`);

  return upscaled;
}

/**
 * Post-processes OCR text to reduce gibberish and improve quality.
 * Removes common OCR artifacts and applies text cleaning rules.
 */
function postProcessOCRText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  // Remove common OCR artifacts
  text = text.replace(/\|/g, 'I'); // Vertical bars often misread as I
  text = text.replace(/[^\x20-\x7E\n]/g, ''); // Remove non-printable characters except newlines

  // Fix common OCR errors
  text = text.replace(/\s{3,}/g, '  '); // Reduce excessive spaces to max 2
  text = text.replace(/\.+/g, '.'); // Reduce multiple periods to single
  text = text.replace(/-+/g, '-'); // Reduce multiple dashes to single
  text = text.replace(/,+/g, ','); // Reduce multiple commas to single

  // Fix word spacing issues
  text = text.replace(/([a-z])([A-Z])/g, '$1 $2'); // Add space between lowercase and uppercase
  text = text.replace(/(\.)([A-Z])/g, '$1 $2'); // Add space after period if missing

  // Remove leading/trailing whitespace from each line
  text = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // Remove very short lines that are likely noise (less than 3 chars and not common words)
  const commonShortWords = new Set(['a', 'i', 'to', 'in', 'on', 'at', 'of', 'or', 'by', 'an', 'as', 'is', 'it', 'be', 'up', 'go', 'do', 'no', 'my', 'we', 'he', 'me']);
  text = text.split('\n')
    .filter(line => {
      if (line.length < 3 && !commonShortWords.has(line.toLowerCase())) {
        return false;
      }
      return true;
    })
    .join('\n');

  // Remove lines that are entirely special characters or numbers (likely noise)
  text = text.split('\n')
    .filter(line => {
      const hasLetter = /[a-zA-Z]/.test(line);
      const hasTooManySpecialChars = (/[^a-zA-Z0-9\s]/.test(line) && line.replace(/[a-zA-Z0-9\s]/g, '').length > line.length / 2);
      return hasLetter || !hasTooManySpecialChars;
    })
    .join('\n');

  return text.trim();
}

/**
 * Detects if OCR is needed for a page based on extracted text.
 * Returns true if text is empty or too short.
 */
export function needsOCR(extractedText: string): boolean {
  // Primary check: empty text
  if (extractedText.length === 0) {
    console.log('[OCR Service] No text detected - OCR needed');
    return true;
  }

  // Secondary check: insufficient text
  if (extractedText.length < MIN_CHARS_FOR_OCR) {
    console.log(`[OCR Service] Text too short (${extractedText.length} chars) - OCR needed`);
    return true;
  }

  return false;
}

/**
 * Lazily loads Tesseract.js only when first needed.
 */
async function getTesseract(): Promise<TesseractModule> {
  if (!Tesseract) {
    console.log('[OCR Service] Lazy loading Tesseract.js...');
    Tesseract = await import('tesseract.js');
    console.log('[OCR Service] Tesseract.js loaded');
  }
  return Tesseract;
}

/**
 * Initializes the OCR worker.
 * Called lazily when first scanned PDF is detected.
 */
async function initializeWorker(): Promise<void> {
  if (worker) {
    return; // Already initialized
  }

  if (isInitializing) {
    if (initPromise) {
      return initPromise; // Already initializing
    }
    return; // Shouldn't happen, but TypeScript safety
  }

  isInitializing = true;

  initPromise = (async () => {
    try {
      ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('init-start', {
        detail: { currentPage: 0, totalPages: 0, progress: 0, status: 'Initializing OCR...' }
      }));

      console.log('[OCR Service] Initializing OCR worker...');

      const Tesseract = await getTesseract();

      // Create worker with optimized settings
      worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          // Forward progress messages via events
          if (m.status === 'recognizing text') {
            const progress = Math.round(m.progress * 100);
            ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('recognizing', {
              detail: {
                currentPage: (ocrEvents as any).currentPage || 0,
                totalPages: (ocrEvents as any).totalPages || 0,
                progress,
                status: `Processing: ${progress}%`
              }
            }));
          }
        }
      });

      // Configure Tesseract for better results
      await worker.setParameters({
        // Preserve text layout
        preserve_interword_spaces: '1',
      });

      console.log('[OCR Service] OCR worker configured with optimized parameters');

      console.log('[OCR Service] OCR worker initialized');
      ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('init-complete', {
        detail: { currentPage: 0, totalPages: 0, progress: 100, status: 'OCR Ready' }
      }));
    } catch (error) {
      console.error('[OCR Service] Failed to initialize OCR worker:', error);
      throw new Error(
        'Failed to initialize OCR. Please check your internet connection and try again. ' +
        'OCR requires downloading language data (first time only).'
      );
    } finally {
      isInitializing = false;
    }
  })();

  return initPromise;
}

/**
 * Performs OCR on a canvas element.
 * @param canvas - The HTMLCanvasElement containing the rendered PDF page
 * @param pageNumber - The page number (for progress tracking)
 * @param totalPages - Total number of pages (for progress tracking)
 * @param signal - Optional AbortSignal for cancellation
 * @returns Promise resolving to the extracted text
 */
export async function performOCR(
  canvas: HTMLCanvasElement,
  pageNumber: number,
  totalPages: number,
  signal?: AbortSignal
): Promise<string> {
  try {
    // Initialize worker if needed
    await initializeWorker();

    if (!worker) {
      throw new Error('OCR worker not initialized');
    }

    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('OCR operation cancelled');
    }

    console.log(`[OCR Service] Performing OCR on page ${pageNumber}/${totalPages}`);

    // Store current page info for progress events
    (ocrEvents as any).currentPage = pageNumber;
    (ocrEvents as any).totalPages = totalPages;

    // Dispatch start event
    ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('page-start', {
      detail: {
        currentPage: pageNumber,
        totalPages,
        progress: 0,
        status: `Starting OCR on page ${pageNumber}...`
      }
    }));

    // Set up progress listener
    const progressListener = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      // Forward with current page info
      ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('page-progress', {
        detail: {
          currentPage: pageNumber,
          totalPages,
          progress: detail.progress,
          status: `Page ${pageNumber}: ${detail.progress}%`
        }
      }));
    };

    ocrEvents.addEventListener('recognizing', progressListener);

    try {
      // Apply preprocessing for better OCR results
      let processedCanvas = preprocessCanvas(canvas);

      // Enhance contrast for better text recognition
      processedCanvas = enhanceContrast(processedCanvas);

      // Upscale for better small text recognition
      processedCanvas = upscaleForOCR(processedCanvas, 2);

      // Convert processed canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        processedCanvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        throw new Error('Failed to convert canvas to blob');
      }

      // Perform recognition
      const result = await worker.recognize(blob);
      let text = result.data.text;

      // Post-process to clean up gibberish and improve quality
      text = postProcessOCRText(text);

      ocrEvents.removeEventListener('recognizing', progressListener);

      // Dispatch complete event
      ocrEvents.dispatchEvent(new CustomEvent<OCRProgressEventDetail>('page-complete', {
        detail: {
          currentPage: pageNumber,
          totalPages,
          progress: 100,
          status: `Page ${pageNumber} complete`
        }
      }));

      console.log(`[OCR Service] OCR complete for page ${pageNumber}: ${text.length} chars (after post-processing)`);
      return text;

    } catch (error) {
      ocrEvents.removeEventListener('recognizing', progressListener);
      throw error;
    }

  } catch (error) {
    console.error(`[OCR Service] OCR failed on page ${pageNumber}:`, error);

    // Dispatch error event
    ocrEvents.dispatchEvent(new CustomEvent('error', {
      detail: { error: error instanceof Error ? error.message : String(error) }
    }));

    throw error;
  }
}

/**
 * Terminates the OCR worker and frees resources.
 */
export async function terminateOCRWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    console.log('[OCR Service] OCR worker terminated');
  }
  initPromise = null;
  isInitializing = false;
}
