import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Loader2 } from 'lucide-react';
import uploadIllustration from '../assets/images/upload-illustration.png';
import { renderPdfToImages } from '../services/pdfService';
import type { RenderedPage } from '../services/pdfService';
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

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const pages = await renderPdfToImages(file);
      onUploadComplete(pages);
    } catch (err) {
      console.error(err);
      setError('Failed to process PDF. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  }, [onUploadComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div
        {...getRootProps()}
        className={cn(
          "relative group cursor-pointer transition-all duration-300",
          "border-2 border-dashed rounded-2xl p-12 text-center",
          isDragActive 
            ? "border-branding-primary bg-branding-primary/10" 
            : "border-white/10 bg-branding-surface hover:border-branding-primary/50"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center">
          {isProcessing ? (
            <Loader2 className="w-16 h-16 text-branding-primary animate-spin mb-4" />
          ) : (
            <img 
              src={uploadIllustration} 
              alt="Upload"
              className={cn(
                "w-48 h-48 mb-6 object-contain drop-shadow-[0_0_30px_rgba(0,209,255,0.3)] transition-transform duration-500",
                isDragActive ? "scale-110" : "group-hover:scale-105"
              )} 
            />
          )}
          
          <h3 className="text-2xl font-bold mb-2 tracking-tight">
            {isProcessing ? 'Processing PDF...' : isDragActive ? 'Drop it here!' : 'Upload your PDF'}
          </h3>
          <p className="text-white/60 mb-6 max-w-xs mx-auto">
            {isProcessing 
              ? 'Rendering pages and extracting text for your tutorial.' 
              : 'Drag & drop your multi-page PDF or click to browse.'}
          </p>

          {!isProcessing && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-medium">
              <FileText className="w-4 h-4" />
              <span>PDF</span>
            </div>
          )}
        </div>

        {/* Glow effect */}
        <div className="absolute inset-0 -z-10 bg-branding-primary/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm animate-fade-in">
          {error}
        </div>
      )}
    </div>
  );
};
