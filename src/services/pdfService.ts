import * as pdfjsLib from 'pdfjs-dist';

import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { needsOCR, performOCR } from './ocrService';
import { generatePDFFingerprint, getCachedOCRText, setCachedOCRText, cleanExpiredOCRCache, loadGlobalSettings } from './storage';
import { performOpenAIOcr } from './aiService';

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

async function getOptimalViewport(page: pdfjsLib.PDFPageProxy, scale: number): Promise<pdfjsLib.PageViewport> {
  const unscaledViewport = page.getViewport({ scale: 1.0 });
  
  let upCount = 0;
  let downCount = 0;
  let leftCount = 0;
  let rightCount = 0;

  try {
    const textContent = await page.getTextContent();
    for (const item of textContent.items) {
      if (!('str' in item) || typeof item.str !== 'string' || !item.str.trim()) continue;
      const [a, b] = item.transform;
      if (a > Math.abs(b)) upCount++; 
      else if (a < -Math.abs(b)) downCount++; 
      else if (b > Math.abs(a)) rightCount++; 
      else if (b < -Math.abs(a)) leftCount++; 
    }
  } catch (e) {
    console.warn('Failed to get text content for rotation detection', e);
  }

  let additionalRotation = 0;
  const max = Math.max(upCount, downCount, leftCount, rightCount);

  if (max > 0) {
    if (max === downCount) additionalRotation = 180;
    else if (max === rightCount) additionalRotation = 270;
    else if (max === leftCount) additionalRotation = 90;
  } else {
    // Fallback: If portrait, assume it should be landscape
    if (unscaledViewport.width < unscaledViewport.height) {
      additionalRotation = 270;
    }
  }

  const finalRotation = (unscaledViewport.rotation + additionalRotation) % 360;
  return page.getViewport({ scale, rotation: finalRotation });
}

export async function renderPdfFirstPageToImage(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const viewport = await getOptimalViewport(page, 2.0);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get canvas context');

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    canvas,
    viewport,
  }).promise;

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Failed to convert PDF page to image');

  return URL.createObjectURL(blob);
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

  const globalSettings = await loadGlobalSettings();

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = await getOptimalViewport(page, 2.0); // High res rendering with auto-rotation
    
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
    let extractedText = '';
    let lastY: number | null = null;
    let lastItem: any = null;
    let lastX: number | null = null;

    const m = viewport.transform;
    const scale = Math.sqrt(m[0] * m[0] + m[1] * m[1]);

    for (const item of textContent.items) {
      if (!('str' in item) || typeof item.str !== 'string') continue;

      const currentX = m[0] * item.transform[4] + m[2] * item.transform[5] + m[4];
      const currentY = m[1] * item.transform[4] + m[3] * item.transform[5] + m[5];

      if (lastItem) {
        const isNewLine = lastY !== null && Math.abs(currentY - lastY) > (5 * scale);
        
        if (isNewLine) {
          extractedText += '\n';
        } else if (!lastItem.str.endsWith(' ') && !item.str.startsWith(' ')) {
          const prevEndX = (lastX || 0) + lastItem.width * scale;
          // Use item.height as a heuristic for space width, fallback to 10
          if (currentX - prevEndX > (item.height || 10) * scale * 0.2) {
            extractedText += ' ';
          }
        }
      }

      extractedText += item.str;
      
      if ('hasEOL' in item && item.hasEOL) {
        extractedText += '\n';
        lastItem = null;
        lastY = null;
        lastX = null;
      } else {
        lastItem = item;
        lastY = currentY;
        lastX = currentX;
      }
    }
    extractedText = extractedText.replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').trim();

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
          if (globalSettings?.useOpenAIOcr) {
            console.log(`[PDF Service] Using OpenAI for OCR on page ${i}`);
            // Type-cast because LLMSettings overlaps with GlobalSettings for the needed properties
            extractedText = await performOpenAIOcr(canvas, {
              apiKey: globalSettings.openaiApiKey || '',
              baseUrl: globalSettings.openaiEndpoint || '',
              model: globalSettings.openaiModel || '',
              openaiEndpoint: globalSettings.openaiEndpoint,
              openaiModel: globalSettings.openaiModel,
              openaiApiKey: globalSettings.openaiApiKey
            });
          } else {
            extractedText = await performOCR(canvas, i, numPages);
          }

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
