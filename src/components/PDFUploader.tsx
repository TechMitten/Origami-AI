import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Loader2 } from 'lucide-react';
import uploadIllustration from '../assets/images/app-logo.png';
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
    <div className="w-full max-w-4xl mx-auto">
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
            {isProcessing ? 'Processing...' : isDragActive ? 'Release to Fold' : 'Upload PDF'}
          </h3>
          
          <p className="text-white/40 mb-8 max-w-xs mx-auto font-medium text-xs sm:text-sm">
            {isProcessing 
              ? 'Turning your PDF into a cinematic tutorial.' 
              : 'Drag & drop your presentation or click to browse.'}
          </p>

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
