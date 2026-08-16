import React from 'react';
import { Film, ImagePlus, MessageSquarePlus, Trash2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import type { AssistantChatSession } from '../../services/storage';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Chats are read newest-first, so how long ago a chat was touched is the useful
 * fact — an absolute date only starts mattering once it falls out of the week.
 */
const formatRelativeTime = (timestamp: number): string => {
  const elapsed = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return 'Just now';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m ago`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h ago`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d ago`;
  return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const sessionPreview = (session: AssistantChatSession): string => {
  const message = session.messages.find((entry) => entry.content.trim() || entry.attachment);
  if (!message) return 'No messages yet';
  if (message.content.trim()) return message.content.trim();
  if (message.attachment?.kind === 'video') return `WebM clip: ${message.attachment.name}`;
  if (message.attachment) return `Image: ${message.attachment.name}`;
  return 'No messages yet';
};

interface ChatRailProps {
  sessions: AssistantChatSession[];
  currentChatId: string | null;
  disabled?: boolean;
  onSelect: (chatId: string) => void;
  onCreate: () => void;
  onDelete: (chatId: string) => void;
  /** Rendered on the mobile drawer only, where the rail sits over the transcript. */
  onClose?: () => void;
  className?: string;
}

export const ChatRail: React.FC<ChatRailProps> = ({
  sessions,
  currentChatId,
  disabled = false,
  onSelect,
  onCreate,
  onDelete,
  onClose,
  className,
}) => (
  <aside
    aria-label="Saved chats"
    className={cn(
      'flex w-[280px] max-w-[85vw] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0a0b]/85 backdrop-blur-xl',
      className,
    )}
  >
    <div className="flex items-center gap-3 px-4 pt-4">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">Chats</h2>
      <span className="font-display text-[11px] tabular-nums text-white/30">{sessions.length}</span>
      <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/12 to-transparent" />
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="focus-ring -mr-1 rounded-lg p-1 text-white/50 transition-colors hover:text-white"
          aria-label="Close chat list"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>

    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={onCreate}
        disabled={disabled}
        className="focus-ring flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        <MessageSquarePlus className="h-4 w-4" />
        New chat
      </button>
    </div>

    <div className="custom-scrollbar mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
      {sessions.map((session) => {
        const isActive = session.id === currentChatId;
        const hasVideo = session.messages.some((message) => message.attachment?.kind === 'video');
        const hasAttachment = session.messages.some((message) => message.attachment);

        return (
          <div
            key={session.id}
            className={cn(
              'group relative rounded-lg border transition-colors',
              isActive
                ? 'border-cyan-400/30 bg-cyan-400/[0.08]'
                : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]',
            )}
          >
            {isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-cyan-400"
              />
            )}

            <button
              type="button"
              onClick={() => onSelect(session.id)}
              disabled={disabled}
              aria-current={isActive ? 'true' : undefined}
              className="focus-ring block w-full rounded-lg px-3 py-2.5 pr-9 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={cn(
                  'block truncate text-sm font-semibold',
                  isActive ? 'text-white' : 'text-white/80',
                )}
              >
                {session.title}
              </span>
              <span className="mt-0.5 block truncate text-xs text-white/35">
                {sessionPreview(session)}
              </span>
              <span className="mt-1.5 flex items-center gap-2 text-[11px] text-white/25">
                <span className="tabular-nums">{session.messages.length} messages</span>
                <span aria-hidden>·</span>
                <span>{formatRelativeTime(session.updatedAt)}</span>
                {hasAttachment && (
                  hasVideo
                    ? <Film aria-hidden className="h-3 w-3" />
                    : <ImagePlus aria-hidden className="h-3 w-3" />
                )}
              </span>
            </button>

            {/* Delete stays out of the way until the row is hovered or focused,
                so a list of chats reads as titles rather than as a row of bins. */}
            <button
              type="button"
              onClick={() => onDelete(session.id)}
              disabled={disabled}
              className="focus-ring absolute right-2 top-2 rounded-lg p-1.5 text-white/35 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-0"
              aria-label={`Delete chat: ${session.title}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>

    <p className="border-t border-white/[0.06] px-4 py-3 text-[11px] leading-relaxed text-white/25">
      Chats are stored in this browser only. Clearing site data deletes them.
    </p>
  </aside>
);
