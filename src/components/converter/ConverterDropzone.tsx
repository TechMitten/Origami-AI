import React, { useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileAudio, ImageIcon, Shrink, UploadCloud } from 'lucide-react';

import { IMAGE_DROPZONE_ACCEPT } from '../../services/imageConvertService';
import { AUDIO_DROPZONE_ACCEPT } from '../../services/audioConvertService';
import type { ConverterKind } from './converterTypes';

interface ConverterDropzoneProps {
  kind: ConverterKind;
  disabled?: boolean;
  /** `rejectedCount` is how many dropped files the accept filter turned away. */
  onFiles: (files: File[], rejectedCount: number) => void;
}

const COPY: Record<ConverterKind, { title: string; hint: string }> = {
  image: {
    title: 'Drop images here',
    hint: 'PNG, JPG, WebP, GIF, BMP, AVIF, SVG',
  },
  audio: {
    title: 'Drop audio or video here',
    hint: 'MP3, WAV, M4A, OGG, Opus, FLAC · MP4/WebM/MOV to rip the audio track',
  },
  compress: {
    title: 'Drop any image or audio here',
    hint: 'Auto-compressed in place — same type, smaller file',
  },
};

export const ConverterDropzone: React.FC<ConverterDropzoneProps> = ({ kind, disabled = false, onFiles }) => {
  const handleDrop = useCallback(
    (accepted: File[], rejected: unknown[]) => {
      if (accepted.length === 0 && rejected.length === 0) return;
      onFiles(accepted, rejected.length);
    },
    [onFiles],
  );

  const accept = useMemo(
    () => (kind === 'image' ? IMAGE_DROPZONE_ACCEPT : kind === 'audio' ? AUDIO_DROPZONE_ACCEPT : { ...IMAGE_DROPZONE_ACCEPT, ...AUDIO_DROPZONE_ACCEPT }),
    [kind],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    accept,
    multiple: true,
    disabled,
  });

  const KindIcon = kind === 'image' ? ImageIcon : kind === 'audio' ? FileAudio : Shrink;
  const copy = COPY[kind];

  return (
    <div
      {...getRootProps()}
      className={[
        'focus-ring flex flex-col items-center justify-center rounded-2xl border border-dashed p-10 text-center transition-colors',
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-50'
          : 'cursor-pointer border-white/15 bg-white/[0.03] hover:border-cyan-400/40 hover:bg-white/[0.06]',
        isDragActive ? 'border-cyan-400/60 bg-cyan-500/10' : '',
      ].join(' ')}
    >
      <input {...getInputProps()} />
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
        {isDragActive ? (
          <UploadCloud className="h-6 w-6 text-cyan-300" />
        ) : (
          <KindIcon className="h-6 w-6 text-white/50" />
        )}
      </div>
      <p className="font-display text-base font-semibold text-white">
        {isDragActive ? 'Release to add them' : copy.title}
      </p>
      <p className="mt-1 text-sm text-white/45">or click to browse — add as many as you like</p>
      <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-white/30">{copy.hint}</p>
    </div>
  );
};
