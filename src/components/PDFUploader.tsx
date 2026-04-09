import React, { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { BrainCircuit, FileText, Loader2, Palette, AlertCircle } from 'lucide-react';
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
  onImportProject?: () => void;
  onStartScreenRecord?: () => void;
  onOpenAssistant?: () => void;
  onOpenIssueReporter?: () => void;
}

export const PDFUploader: React.FC<PDFUploaderProps> = ({ onUploadComplete, onImportProject, onStartScreenRecord, onOpenAssistant, onOpenIssueReporter }) => {
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
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-0" style={{ fontFamily: '"Roboto", "Inter", system-ui, -apple-system, sans-serif' }}>
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
          Let's Get Started
        </h2>
        <p className="text-sm text-white/60">
          Choose how you want to start your project
        </p>
      </div>

      {/* Three Equal-Sized Options */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {/* Studio Option - Upload PDF */}
        <div
          {...getRootProps()}
          className={cn(
            "relative group cursor-pointer transition-all duration-200 overflow-hidden",
            "bg-[#0F1115] border border-white/10",
            "hover:border-blue-500/30 hover:bg-white/[0.02]",
            "rounded-lg",
            "flex flex-col items-center justify-center text-center p-6 sm:p-8",
            "min-h-[280px] sm:min-h-[320px]",
            isDragActive && "border-blue-500/50 bg-blue-500/5"
          )}
        >
          <input {...getInputProps()} />

          {/* Icon */}
          <div className={cn(
            "mb-4 p-4 rounded-xl transition-all duration-200",
            isDragActive ? "bg-blue-500/10" : "bg-white/5 group-hover:bg-blue-500/5"
          )}>
            {isProcessing ? (
              <Loader2 className="w-8 h-8 sm:w-10 sm:h-10 text-blue-400 animate-spin" />
            ) : (
              <Palette className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 transition-colors duration-200",
                isDragActive ? "text-blue-400" : "text-white/50 group-hover:text-blue-400"
              )} />
            )}
          </div>

          {/* Title */}
          <h3 className={cn(
            "text-lg sm:text-xl font-medium text-white mb-2 transition-colors duration-200",
            isDragActive && "text-blue-300"
          )}>
            Studio
          </h3>

          {/* Description */}
          <p className="text-xs sm:text-sm text-white/50 mb-4 max-w-[200px]">
            {isDragActive
              ? 'Release to upload'
              : 'Create videos from 2D content with AI narration'
            }
          </p>

          {/* Status Badge */}
          {isProcessing && (
            <div className="mt-auto">
              <div className="w-full max-w-[180px] mx-auto">
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-blue-400 transition-all duration-300"
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-white/40 text-center">
                  {ocrStatus === 'processing'
                    ? `Processing ${ocrCurrentPage}/${ocrTotalPages} - ${ocrProgress}%`
                    : 'Processing...'}
                </p>
              </div>
            </div>
          )}

          {!isProcessing && (
            <div className="mt-auto">
              <div className={cn(
                "px-4 py-2 rounded-lg text-xs font-medium border transition-all duration-200",
                isDragActive
                  ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  : "bg-white/5 text-white/40 border-white/10 group-hover:bg-blue-500/5 group-hover:text-blue-400 group-hover:border-blue-500/20"
              )}>
                Select PDF File
              </div>
            </div>
          )}

          {/* Subtle hover glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>

        {/* Assistant Option */}
        <div
          onClick={onOpenAssistant}
          className={cn(
            "relative group cursor-pointer transition-all duration-200 overflow-hidden",
            "bg-[#0F1115] border border-white/10",
            "hover:border-cyan-500/30 hover:bg-white/[0.02]",
            "rounded-lg",
            "flex flex-col items-center justify-center text-center p-6 sm:p-8",
            "min-h-[280px] sm:min-h-[320px]"
          )}
        >
          <div className={cn(
            "mb-4 p-4 rounded-xl transition-all duration-200 bg-white/5 group-hover:bg-cyan-500/5"
          )}>
            <BrainCircuit className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 group-hover:text-cyan-300 transition-colors duration-200" />
          </div>

          <h3 className="text-lg sm:text-xl font-medium text-white mb-2 group-hover:text-cyan-200 transition-colors duration-200">
            AI Assistant
          </h3>

          <p className="text-xs sm:text-sm text-white/50 mb-4 max-w-[220px]">
            Open the WebLLM-powered chat workspace for writing, brainstorming, and revisions
          </p>

          <div className="mt-auto">
            <div className={cn(
              "px-4 py-2 rounded-lg text-xs font-medium border transition-all duration-200",
              "bg-white/5 text-white/40 border-white/10 group-hover:bg-cyan-500/5 group-hover:text-cyan-300 group-hover:border-cyan-500/20"
            )}>
              Open Assistant
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>

        {/* Issue Reporter Option */}
        <div
          onClick={onOpenIssueReporter}
          className={cn(
            "relative group cursor-pointer transition-all duration-200 overflow-hidden",
            "bg-[#0F1115] border border-white/10",
            "hover:border-amber-500/30 hover:bg-white/[0.02]",
            "rounded-lg",
            "flex flex-col items-center justify-center text-center p-6 sm:p-8",
            "min-h-[280px] sm:min-h-[320px]"
          )}
        >
          <div className={cn(
            "mb-4 p-4 rounded-xl transition-all duration-200 bg-white/5 group-hover:bg-amber-500/5"
          )}>
            <AlertCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white/50 group-hover:text-amber-300 transition-colors duration-200" />
          </div>

          <h3 className="text-lg sm:text-xl font-medium text-white mb-2 group-hover:text-amber-200 transition-colors duration-200">
            Issue Reporter
          </h3>

          <p className="text-xs sm:text-sm text-white/50 mb-4 max-w-[220px]">
            Report bugs or suggest features to help improve Origami AI
          </p>

          <div className="mt-auto">
            <div className={cn(
              "px-4 py-2 rounded-lg text-xs font-medium border transition-all duration-200",
              "bg-white/5 text-white/40 border-white/10 group-hover:bg-amber-500/5 group-hover:text-amber-300 group-hover:border-amber-500/20"
            )}>
              Report Issue
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-6 p-4 rounded-lg bg-red-500/5 border border-red-500/10 text-red-400 text-xs font-medium text-center animate-in fade-in slide-in-from-top-2">
          {error}
        </div>
      )}
    </div>
  );
};
