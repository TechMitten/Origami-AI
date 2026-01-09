import * as pdfjsLib from 'pdfjs-dist';
import { recognize } from 'tesseract.js';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// Set worker path to local import using Vite's ?url loading
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface RenderedPage {
  dataUrl: string;
  text: string;
  pageNumber: number;
  width: number;
  height: number;
}

export async function renderPdfToImages(file: File): Promise<RenderedPage[]> {
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
    const text = textContent.items
      .map((item) => {
        if ('str' in item && typeof item.str === 'string') {
          return item.str;
        }
        return '';
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    let finalText = text;

    // Fallback to OCR if text extraction yields little to no results, or if the results look suspicious (garbage text layer)
    // We increase threshold to 750 to catch slides that have text layers but are messy/incomplete (like the Vibe Coder Launchpad example)
    if (finalText.length < 750) {
      console.log(`Page ${i}: Checking text quality (${finalText.length} chars). Attempting OCR with preprocessing...`);
      try {
        // High-res rendering for OCR (300 DPI)
        // 72 DPI is standard PDF scale 1.0 -> 300 / 72 = 4.166...
        const ocrScale = 4.17; 
        const ocrViewport = page.getViewport({ scale: ocrScale });
        
        const ocrCanvas = document.createElement('canvas');
        ocrCanvas.width = ocrViewport.width;
        ocrCanvas.height = ocrViewport.height;
        const ocrCtx = ocrCanvas.getContext('2d', { willReadFrequently: true });
        
        if (ocrCtx) {
           // Render page specifically for OCR
           await page.render({
             canvasContext: ocrCtx,
             canvas: ocrCanvas,
             viewport: ocrViewport
           }).promise;
           
           const imageData = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);
           const data = imageData.data;
           
           // Pass 1: Build Histogram & Analyze Brightness
           const histogram = new Array(256).fill(0);
           let totalGray = 0;

           for (let p = 0; p < data.length; p += 4) {
             const r = data[p];
             const g = data[p + 1];
             const b = data[p + 2];
             // Standard Rec. 709 luma coefficients
             const gray = Math.floor(0.2126 * r + 0.7152 * g + 0.0722 * b);
             histogram[gray]++;
             totalGray += gray;
           }

           const avgLum = totalGray / (data.length / 4);
           // If average luminance is low, it's likely a dark background (White text on Dark BG)
           const isDarkBg = avgLum < 128;

           // Calculate Otsu's Threshold
           const total = data.length / 4;
           let sum = 0;
           for (let i = 0; i < 256; i++) sum += i * histogram[i];
           
           let sumB = 0;
           let wB = 0;
           let wF = 0;
           let maxVar = 0;
           let threshold = 128; // Fallback
           
           for (let i = 0; i < 256; i++) {
             wB += histogram[i];
             if (wB === 0) continue;
             wF = total - wB;
             if (wF === 0) break;
             
             sumB += i * histogram[i];
             const mB = sumB / wB;
             const mF = (sum - sumB) / wF;
             
             const varBetween = wB * wF * (mB - mF) * (mB - mF);
             if (varBetween > maxVar) {
                maxVar = varBetween;
                threshold = i;
             }
           }

           // Pass 2: Strict Binarization (Black/White only)
           for (let p = 0; p < data.length; p += 4) {
             const r = data[p];
             const g = data[p + 1];
             const b = data[p + 2];
             const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;

             // Logic: We want final TEXT to be BLACK (0) and BACKGROUND to be WHITE (255) for Tesseract.
             let val = 255; 

             if (isDarkBg) {
                // Dark Mode: Text is Bright (> threshold). Background is Dark (< threshold).
                // If pixel > threshold (Text), make it BLACK (0).
                val = gray > threshold ? 0 : 255;
             } else {
                // Light Mode: Text is Dark (< threshold). Background is Bright (> threshold).
                // If pixel < threshold (Text), make it BLACK (0).
                val = gray < threshold ? 0 : 255;
             }

             data[p] = val;
             data[p + 1] = val;
             data[p + 2] = val;
           }
           
           ocrCtx.putImageData(imageData, 0, 0);
           
           const { data: { text: ocrText } } = await recognize(ocrCanvas, 'eng');
           
           // If OCR gives us more text, use it
           if (ocrText.trim().length > finalText.length) {
              finalText = ocrText.replace(/\s+/g, ' ').trim();
              console.log(`Page ${i}: OCR successful. Extracted ${finalText.length} chars.`);
           }
        }
      } catch (ocrErr) {
        console.error(`Page ${i}: OCR failed`, ocrErr);
      }
    }

    pages.push({
      dataUrl,
      text: finalText,
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}
