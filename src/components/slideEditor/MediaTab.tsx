import React from 'react';
import { Camera, Download, Upload, Video as VideoIcon } from 'lucide-react';
import chromeExtensionZip from '../../assets/extension/chrome-extension.zip?url';

interface MediaTabProps {
  mediaInputRef: React.RefObject<HTMLInputElement | null>;
  handleMediaUpload: (e: React.ChangeEvent<HTMLInputElement>) => void | Promise<void>;
  onStartScreenRecord?: () => void;
}

export const MediaTab: React.FC<MediaTabProps> = ({
  mediaInputRef,
  handleMediaUpload,
  onStartScreenRecord,
}) => {
  return (
    <div className="max-w-4xl w-full mx-auto flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="shrink-0 space-y-2">
        <h3 className="text-xl font-bold text-white flex items-center gap-3">
          <Camera className="w-6 h-6" />
          Slide Media
        </h3>
        <p className="text-base text-white/50">Manage assets and insert special slide types.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-branding-primary/10 flex items-center justify-center">
            <VideoIcon className="w-8 h-8 text-branding-primary" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h4 className="text-lg font-bold text-white">Upload Media File</h4>
            <p className="text-sm text-white/60 leading-relaxed">
              Insert an MP4 video or animated GIF as a standalone slide.
            </p>
          </div>

          <input type="file" ref={mediaInputRef} className="hidden" accept="video/mp4,image/gif" onChange={handleMediaUpload} />
          <button
            onClick={() => mediaInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-white/25 bg-branding-primary text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-branding-primary/30 hover:bg-branding-primary/90 hover:border-white/40 hover:shadow-xl hover:shadow-branding-primary/40 active:scale-[0.98] transition-all"
          >
            <Upload className="w-4 h-4" />
            Select File
          </button>
        </div>

        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-branding-accent/10 flex items-center justify-center">
            <VideoIcon className="w-8 h-8 text-branding-accent" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h4 className="text-lg font-bold text-white">Record Screen</h4>
            <p className="text-sm text-white/60 leading-relaxed">
              Capture your screen to create a new video slide instantly.
            </p>
          </div>

          <button
            onClick={() => onStartScreenRecord && onStartScreenRecord()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-branding-accent text-white font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-branding-accent/30 hover:bg-branding-accent/90 focus:outline-none focus:ring-2 focus:ring-white/60 transition-all active:scale-[0.98]"
          >
            <VideoIcon className="w-4 h-4" />
            Start Recording
          </button>
        </div>

        <div className="p-8 rounded-3xl bg-white/5 border border-white/10 border-dashed flex flex-col items-center justify-center text-center space-y-5">
          <div className="w-16 h-16 rounded-full bg-emerald-400/10 flex items-center justify-center shadow-lg shadow-emerald-400/10">
            <Download className="w-8 h-8 text-emerald-300" />
          </div>
          <div className="space-y-2 max-w-sm">
            <h4 className="text-lg font-bold text-white">Download Extension</h4>
            <p className="text-sm text-white/60 leading-relaxed">
              Get the Chrome extension ZIP for screen recording support.
            </p>
          </div>

          <a
            href={chromeExtensionZip}
            download="chrome-extension.zip"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-emerald-300/30 bg-emerald-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider shadow-lg shadow-emerald-400/30 hover:bg-emerald-300 hover:border-emerald-200/50 hover:shadow-xl hover:shadow-emerald-400/40 active:scale-[0.98] transition-all"
          >
            <Download className="w-4 h-4" />
            Download ZIP
          </a>
        </div>
      </div>
    </div>
  );
};
