import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { ArrowDown, Check, Copy, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { AssistantChatMessage } from '../../services/storage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * react-markdown v10 dropped the `inline` flag, so a code node cannot tell you
 * whether it came from a fence. The block treatment therefore lives on `pre`,
 * and `code` only ever carries the inline styling — nested code inherits the
 * block's own surface instead of painting a second one inside it.
 */
const MARKDOWN_COMPONENTS: Components = {
  p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0" {...props} />,
  li: ({ node, ...props }) => <li className="pl-1 marker:text-white/30" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="mb-3 border-l-2 border-cyan-400/40 pl-3 italic text-white/60" {...props} />
  ),
  code: ({ node, className, ...props }) => (
    <code
      className={cn(
        'rounded bg-black/45 px-1.5 py-0.5 font-mono text-[0.85em] text-cyan-200',
        className,
      )}
      {...props}
    />
  ),
  pre: ({ node, children, ...props }) => (
    <pre
      className="custom-scrollbar mb-3 overflow-x-auto rounded-lg border border-white/[0.08] bg-black/45 p-3 font-mono text-xs leading-relaxed text-cyan-100 last:mb-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
      {...props}
    >
      {children}
    </pre>
  ),
  h1: ({ node, ...props }) => (
    <h1 className="font-display mb-2 mt-5 text-base font-bold text-white first:mt-0" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="font-display mb-2 mt-5 text-sm font-bold text-white first:mt-0" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mb-2 mt-4 text-sm font-bold text-white/90 first:mt-0" {...props} />
  ),
  strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
  a: ({ node, ...props }) => (
    <a
      className="text-cyan-300 underline decoration-cyan-400/40 underline-offset-2 hover:text-cyan-200"
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    />
  ),
  hr: ({ node, ...props }) => <hr className="my-4 border-white/10" {...props} />,
  table: ({ node, ...props }) => (
    <div className="custom-scrollbar mb-3 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node, ...props }) => (
    <th className="border border-white/10 bg-white/[0.04] px-2 py-1 text-left font-semibold" {...props} />
  ),
  td: ({ node, ...props }) => <td className="border border-white/10 px-2 py-1" {...props} />,
};

const Attachment: React.FC<{ message: AssistantChatMessage }> = ({ message }) => {
  if (!message.attachment) return null;

  return (
    <figure className="mb-3 overflow-hidden rounded-lg border border-white/10 bg-black/40">
      {message.attachment.kind === 'image' ? (
        <img
          src={message.attachment.dataUrl}
          alt={message.attachment.name}
          className="max-h-72 w-full object-contain"
        />
      ) : (
        <video src={message.attachment.dataUrl} controls className="max-h-72 w-full bg-black" />
      )}
      <figcaption className="truncate border-t border-white/[0.06] px-3 py-1.5 text-[11px] text-white/40">
        {message.attachment.name}
      </figcaption>
    </figure>
  );
};

interface ChatMessagesProps {
  messages: AssistantChatMessage[];
  isStreaming: boolean;
  emptyState: React.ReactNode;
  onRetry: (messageId: string) => void;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  isStreaming,
  emptyState,
  onRetry,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  // Whether the reader is parked at the bottom. A ref, not state: the streaming
  // effect below reads it on every token and must not re-run because of it.
  const isPinnedRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
    isPinnedRef.current = true;
    setShowJumpButton(false);
  }, []);

  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isPinnedRef.current = distanceFromBottom < 64;
    setShowJumpButton(distanceFromBottom > 160);
  }, []);

  // Follow the reply while it streams, but only for a reader who is already at
  // the bottom — scrolling up is how you ask to read back, and yanking the view
  // down on the next token would undo that.
  useEffect(() => {
    if (!isPinnedRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  useEffect(() => () => {
    if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
  }, []);

  const lastMessage = messages[messages.length - 1];
  const hasCompletedReply = Boolean(
    !isStreaming && lastMessage?.role === 'assistant' && lastMessage.content && !lastMessage.isError,
  );

  const handleCopy = async (message: AssistantChatMessage) => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard access can be denied; the text stays selectable either way.
    }
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="custom-scrollbar h-full overflow-y-auto px-4 sm:px-6"
      >
        {/* The transcript sets aria-live to off on purpose: `log` announces
            politely by default, which would read a streamed reply out word by
            word. The status line further down announces the transitions. */}
        {messages.length === 0 ? (
          emptyState
        ) : (
          <div role="log" aria-live="off" className="mx-auto w-full max-w-3xl space-y-7 py-6">
            {messages.map((message, index) => {
              const isAssistant = message.role === 'assistant';
              const isLast = index === messages.length - 1;
              const isWaiting = isAssistant && isLast && isStreaming && !message.content;
              const isWriting = isAssistant && isLast && isStreaming && Boolean(message.content);

              if (!isAssistant) {
                return (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-sm border border-cyan-400/25 bg-cyan-400/[0.09] px-4 py-3">
                      <Attachment message={message} />
                      {message.content && (
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white">
                          {message.content}
                        </p>
                      )}
                      {!message.content && message.attachment && (
                        <p className="text-sm text-white/50">
                          {message.attachment.kind === 'video' ? 'Attached a clip' : 'Attached an image'}
                        </p>
                      )}
                    </div>
                  </div>
                );
              }

              if (message.isError) {
                return (
                  <div
                    key={message.id}
                    className="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-4 py-3"
                  >
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-relaxed text-amber-100/90">{message.content}</p>
                      <button
                        type="button"
                        onClick={() => onRetry(message.id)}
                        disabled={isStreaming}
                        className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 px-2.5 py-1.5 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-400/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Try again
                      </button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={message.id} className="group">
                  {isWaiting ? (
                    <p className="flex items-center gap-2 text-sm text-white/45">
                      <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
                      Thinking...
                    </p>
                  ) : (
                    <>
                      <div className="text-sm leading-7 text-white/85">
                        <ReactMarkdown components={MARKDOWN_COMPONENTS}>
                          {message.content}
                        </ReactMarkdown>
                        {isWriting && <span aria-hidden className="stream-caret" />}
                      </div>

                      {/* Actions stay reserved but invisible until the message is
                          hovered or focused, so the transcript reads as prose. */}
                      <div className="mt-2 flex h-5 items-center gap-3 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => void handleCopy(message)}
                          className="focus-ring inline-flex items-center gap-1.5 rounded text-[11px] font-semibold text-white/40 transition-colors hover:text-white"
                          aria-label="Copy reply"
                        >
                          {copiedId === message.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                        <span className="text-[11px] tabular-nums text-white/25">
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {isStreaming ? 'The assistant is writing a reply.' : hasCompletedReply ? 'Reply ready.' : ''}
      </p>

      {showJumpButton && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="focus-ring absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-white/10 bg-[#0a0a0b]/90 px-3 py-1.5 text-xs font-semibold text-white/70 shadow-lg shadow-black/40 backdrop-blur transition-colors hover:border-cyan-400/40 hover:text-white"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          Latest
        </button>
      )}
    </div>
  );
};
