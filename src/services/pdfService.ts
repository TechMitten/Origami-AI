import * as pdfjsLib from 'pdfjs-dist';
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

    pages.push({
      dataUrl,
      text,
      pageNumber: i,
      width: viewport.width,
      height: viewport.height,
    });
  }

  return pages;
}
