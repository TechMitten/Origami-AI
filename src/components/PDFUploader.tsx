import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Loader2 } from 'lucide-react';
import uploadIllustration from '../assets/images/app-logo.png';
import { renderPdfToImages } from '../services/pdfService';
import type { RenderedPage } from '../services/pdfService';
import { ocrEvents, type OCRProgressEventDetail } from '../services/ocrService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PDFUploaderProps {
  onUploadComplete: (pages: RenderedPage[]) => void;
}

export const PDFUploader: React.FC<PDFUploaderProps> = ({ onUploadComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OCR progress state
  const [ocrStatus, setOcrStatus] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrCurrentPage, setOcrCurrentPage] = useState(0);
  const [ocrTotalPages, setOcrTotalPages] = useState(0);

  // Listen to OCR events
  useEffect(() => {
    const handleInitStart = () => {
      console.log('[PDFUploader] OCR initialization started');
      setOcrStatus('initializing');
    };

    const handleInitComplete = () => {
      console.log('[PDFUploader] OCR initialization complete');
      setOcrStatus('ready');
    };

    const handlePageStart = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      console.log('[PDFUploader] OCR page start:', detail);
      setOcrStatus('processing');
      setOcrCurrentPage(detail.currentPage);
      setOcrTotalPages(detail.totalPages);
      setOcrProgress(detail.progress);
    };

    const handlePageProgress = (e: Event) => {
      const detail = (e as CustomEvent<OCRProgressEventDetail>).detail;
      setOcrProgress(detail.progress);
    };

    const handlePageComplete = () => {
      console.log('[PDFUploader] OCR page complete');
    };

    const handleError = (e: Event) => {
      const detail = (e as CustomEvent<{ error: string }>).detail;
      console.error('[PDFUploader] OCR error:', detail.error);
      setError(`OCR failed: ${detail.error}. Please try again.`);
      setOcrStatus(null);
    };

    ocrEvents.addEventListener('init-start', handleInitStart);
    ocrEvents.addEventListener('init-complete', handleInitComplete);
    ocrEvents.addEventListener('page-start', handlePageStart);
    ocrEvents.addEventListener('page-progress', handlePageProgress);
    ocrEvents.addEventListener('page-complete', handlePageComplete);
    ocrEvents.addEventListener('error', handleError);

    return () => {
      ocrEvents.removeEventListener('init-start', handleInitStart);
      ocrEvents.removeEventListener('init-complete', handleInitComplete);
      ocrEvents.removeEventListener('page-start', handlePageStart);
      ocrEvents.removeEventListener('page-progress', handlePageProgress);
      ocrEvents.removeEventListener('page-complete', handlePageComplete);
      ocrEvents.removeEventListener('error', handleError);
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setOcrStatus(null);
    setOcrProgress(0);

    try {
      const pages = await renderPdfToImages(file);
      onUploadComplete(pages);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to process PDF. Please try again.');
    } finally {
      setIsProcessing(false);
      setOcrStatus(null);
      setOcrProgress(0);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-0">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(1deg); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer transition-all duration-500",
          "border-2 border-dashed rounded-3xl px-8 py-8 sm:px-20 sm:py-10 text-center overflow-hidden",
          "backdrop-blur-md bg-white/2",
          isDragActive 
            ? "border-cyan-500/50 bg-cyan-500/10 scale-[1.02]" 
            : "border-white/10 hover:border-purple-500/40 hover:bg-white/4"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center relative z-10">
          {isProcessing ? (
            <div className="w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center -mb-4">
              <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-cyan-400 animate-spin" />
            </div>
          ) : (
            <div className={cn(
              "relative transition-transform duration-700 ease-out animate-float",
              isDragActive ? "scale-110" : "group-hover:scale-105"
            )}>
              <img 
                src={uploadIllustration} 
                alt="Logo"
                className="w-48 h-48 sm:w-64 sm:h-64 -mb-6 sm:-mb-8 object-contain drop-shadow-[0_0_50px_rgba(34,211,238,0.2)]" 
              />
              {/* Extra glow layer */}
              <div className="absolute inset-0 bg-linear-to-b from-cyan-500/20 to-purple-500/20 blur-[60px] -z-10 opacity-50" />
            </div>
          )}
          
          <h3 className={cn(
            "text-2xl sm:text-3xl font-black mb-3 tracking-tighter italic uppercase text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 pr-2",
            isProcessing && "animate-pulse"
          )}>
            {isProcessing
              ? (ocrStatus === 'initializing' ? 'Initializing OCR...'
                : ocrStatus === 'processing' ? 'OCR Processing...'
                : 'Processing...')
              : isDragActive ? 'Release to Fold' : 'Upload PDF'}
          </h3>

          <p className="text-white/40 mb-8 max-w-xs mx-auto font-medium text-xs sm:text-sm">
            {isProcessing
              ? (ocrStatus === 'initializing'
                ? 'Enabling OCR for scanned PDF...'
                : ocrStatus === 'processing'
                ? `Processing page ${ocrCurrentPage}${ocrTotalPages > 0 ? `/${ocrTotalPages}` : ''}${ocrProgress > 0 ? ` - ${ocrProgress}%` : ''}...`
                : 'Turning your PDF into a cinematic tutorial.')
              : 'Drag & drop your presentation or click to browse.'}
          </p>

          {/* OCR Progress Bar */}
          {isProcessing && ocrStatus === 'processing' && (
            <div className="w-full max-w-xs mx-auto mb-6">
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-purple-600 transition-all duration-300 ease-out"
                  style={{ width: `${ocrProgress}%` }}
                />
              </div>
              <p className="text-white/40 text-xs mt-2 text-center">
                OCR: {ocrProgress}% complete
              </p>
            </div>
          )}

          {!isProcessing && (
            <div className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 group-hover:text-white/80 group-hover:border-white/20 transition-all">
              <FileText className="w-3.5 h-3.5" />
              <span>Select Document</span>
            </div>
          )}
        </div>

        {/* Dynamic Background Glow */}
        <div className={cn(
          "absolute inset-0 -z-10 transition-opacity duration-700 blur-[100px]",
          isDragActive ? "opacity-40 bg-cyan-500/20" : "opacity-0 group-hover:opacity-20 bg-purple-500/20"
        )} />
      </div>

      {error && (
        <div className="mt-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold uppercase tracking-wider text-center animate-in fade-in slide-in-from-top-2">
          {error}
        </div>
      )}
    </div>
  );
};
