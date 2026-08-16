import React, { useEffect, useRef } from 'react';
import { Loader2, Paperclip, Send, Square, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { AssistantChatAttachment } from '../../services/storage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type EngineState = 'ready' | 'loading' | 'idle' | 'none';

const ENGINE_STATUS: Record<EngineState, { label: string; dot: string; text: string }> = {
  ready: { label: 'Ready', dot: 'bg-emerald-400', text: 'text-emerald-300/80' },
  loading: { label: 'Loading', dot: 'bg-cyan-400 animate-pulse', text: 'text-cyan-300/80' },
  idle: { label: 'Not loaded', dot: 'bg-white/25', text: 'text-white/40' },
  none: { label: 'No model chosen', dot: 'bg-amber-400', text: 'text-amber-300/80' },
};

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  isDisabled: boolean;

  attachment: AssistantChatAttachment | null;
  onAttachFile: (file: File) => void;
  onRemoveAttachment: () => void;
  isReadingAttachment: boolean;
  acceptsImages: boolean;

  engineState: EngineState;
  modelName: string | null;
  modelSize?: string;
  supportsVision: boolean;
  onChangeModel: () => void;
  onLoadModel: () => void;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  isDisabled,
  attachment,
  onAttachFile,
  onRemoveAttachment,
  isReadingAttachment,
  acceptsImages,
  engineState,
  modelName,
  modelSize,
  supportsVision,
  onChangeModel,
  onLoadModel,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${Math.min(element.scrollHeight, 200)}px`;
  }, [value]);

  const status = ENGINE_STATUS[engineState];
  const canSend = Boolean(value.trim() || attachment) && !isStreaming && !isDisabled && !isReadingAttachment;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="border-t border-white/[0.06] bg-[#0a0a0b]/85 px-4 py-4 backdrop-blur-xl sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        {/* The engine dock. One line naming what is loaded, how big it is and
            what it can read — the facts that decide whether a reply will be
            fast, and previously spread across a header pill and two footnotes. */}
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
          <span aria-hidden className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status.dot)} />
          <span className="font-display truncate text-xs text-white/75">
            {modelName || 'No model'}
          </span>
          <span className="hidden text-[11px] text-white/30 sm:inline">
            {modelSize ? `${modelSize} · ` : ''}
            {supportsVision ? 'text + images' : 'text only'}
          </span>
          <span className={cn('text-[11px] font-semibold', status.text)}>{status.label}</span>

          <div className="ml-auto flex items-center gap-2">
            {engineState !== 'ready' && (
              <button
                type="button"
                onClick={onLoadModel}
                disabled={isDisabled || isStreaming || engineState === 'loading'}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200 transition-colors hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {engineState === 'loading' && <Loader2 className="h-3 w-3 animate-spin" />}
                {engineState === 'loading' ? 'Loading' : 'Load'}
              </button>
            )}
            <button
              type="button"
              onClick={onChangeModel}
              disabled={isDisabled || isStreaming || engineState === 'loading'}
              className="focus-ring rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-white/60 transition-colors hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Change
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={acceptsImages ? 'image/*,video/webm,.webm' : 'video/webm,.webm'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) onAttachFile(file);
          }}
          className="hidden"
        />

        {attachment && (
          <div className="mb-2 flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
            {attachment.kind === 'image' ? (
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                className="h-14 w-16 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <video
                src={attachment.dataUrl}
                className="h-14 w-16 shrink-0 rounded-lg bg-black object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white/85">{attachment.name}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/35">
                {attachment.kind === 'image'
                  ? 'Sent to the local vision model with your message.'
                  : 'Saved with the chat. The model reads your description of it, not the video.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemoveAttachment}
              className="focus-ring rounded-lg p-1.5 text-white/40 transition-colors hover:text-white"
              aria-label="Remove attachment"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 transition-colors focus-within:border-cyan-400/40">
          <label htmlFor="assistant-composer" className="sr-only">
            Message the assistant
          </label>
          <textarea
            id="assistant-composer"
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              engineState === 'none'
                ? 'Choose a model to start chatting...'
                : acceptsImages
                  ? 'Message the assistant, or attach an image or clip...'
                  : 'Message the assistant, or attach a WebM clip...'
            }
            disabled={isDisabled}
            rows={1}
            className="max-h-[200px] min-h-[48px] w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-white outline-none placeholder:text-white/30 disabled:cursor-not-allowed"
          />

          <div className="flex items-center justify-between gap-2 px-1.5 pb-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isDisabled || isStreaming || isReadingAttachment}
              className="focus-ring rounded-lg p-2 text-white/45 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={acceptsImages ? 'Attach an image or WebM clip' : 'Attach a WebM clip'}
              title={acceptsImages ? 'Attach an image or WebM clip' : 'Attach a WebM clip'}
            >
              {isReadingAttachment ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Paperclip className="h-4 w-4" />
              )}
            </button>

            <div className="flex items-center gap-3">
              <span className="hidden text-[11px] text-white/25 sm:inline">
                Enter to send · Shift + Enter for a line break
              </span>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/80 transition-colors hover:border-red-400/40 hover:text-red-200"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSend}
                  disabled={!canSend}
                  className={cn(
                    'focus-ring flex h-9 w-9 items-center justify-center rounded-xl transition-all',
                    canSend
                      ? 'bg-gradient-to-r from-cyan-400 to-blue-500 text-black shadow-[0_8px_28px_-12px_rgba(34,211,238,0.9)] hover:brightness-110'
                      : 'cursor-not-allowed border border-white/10 bg-white/5 text-white/25',
                  )}
                  aria-label="Send message"
                  title="Send message"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
