import * as pdfjsLib from 'pdfjs-dist';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { needsOCR, performOCR } from './ocrService';
import { generatePDFFingerprint, getCachedOCRText, setCachedOCRText, cleanExpiredOCRCache } from './storage';

// Set worker path to local import using Vite's ?url loading
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface RenderedPage {
  dataUrl: string;
  text: string;
  pageNumber: number;
  width: number;
  height: number;
  ocrWarning?: string;
}

export async function renderPdfToImages(file: File): Promise<RenderedPage[]> {
  // Generate PDF fingerprint for OCR caching
  const fingerprint = await generatePDFFingerprint(file);
  console.log(`[PDF Service] Generated fingerprint: ${fingerprint.substring(0, 8)}...`);

  // Clean expired cache entries (run occasionally)
  await cleanExpiredOCRCache();

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High res rendering
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) throw new Error('Could not get canvas context');

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context!,
      canvas,
      viewport: viewport,
    }).promise;

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to convert canvas to blob');
    const dataUrl = URL.createObjectURL(blob);

    // Extract text for initial script
    const textContent = await page.getTextContent();
    let extractedText = textContent.items
      .map((item) => {
        if ('str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let ocrWarning: string | undefined = undefined;

    // Check if OCR is needed (image-based PDF or insufficient text)
    if (needsOCR(extractedText)) {
      console.log(`[PDF Service] Page ${i}: No text detected, using OCR...`);

      try {
        // Check cache first
        const cachedText = await getCachedOCRText(fingerprint, i);
        if (cachedText !== null) {
          console.log(`[PDF Service] Using cached OCR text for page ${i}`);
          extractedText = cachedText;
        } else {
          // Perform OCR
          extractedText = await performOCR(canvas, i, numPages);

          // Cache the result
          await setCachedOCRText(fingerprint, i, extractedText);
          console.log(`[PDF Service] Cached OCR text for page ${i}`);
        }

        // Check if OCR actually found text
        if (!extractedText.trim()) {
          ocrWarning = `No text detected on page ${i} - may be image-only or contain no readable text`;
          console.warn(`[PDF Service] ${ocrWarning}`);
        }
      } catch (error) {
        console.error(`[PDF Service] OCR failed on page ${i}:`, error);
        throw new Error(`OCR failed on page ${i}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    pages.push({
      dataUrl,
      text: extractedText,
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
      ocrWarning,
    });
  }

  return pages;
}
