import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Settings, CircleHelp, User as UserIcon, LogOut } from 'lucide-react';
import { TransitionLink } from './TransitionLink';
import { HeaderActionsMenu } from './HeaderActionsMenu';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '../context/AuthContext';
import { AuthModal } from './AuthModal';

interface PageHeaderProps {
  /** Title to display next to logo, e.g., "Issue Reporter" or "AI Assistant" */
  title?: string;
  /** Show back button or custom left content */
  showBack?: boolean;
  /** Custom left content (overrides default logo + title) */
  leftContent?: ReactNode;
  /** Custom center content */
  centerContent?: ReactNode;
  /** Informational content shown before the utility buttons and actions menu */
  rightContent?: ReactNode;
  /** Additional items appended below the shared app navigation in the actions menu */
  actionMenuContent?: (closeMenu: () => void) => ReactNode;
  /** Show actions menu on the right (default: true) */
  showActionsMenu?: boolean;
  /** Show settings button (default: true) */
  showSettings?: boolean;
  /** Show help button (default: true) */
  showHelp?: boolean;
  /** Show notification bell (default: true) */
  showNotifications?: boolean;
  /** Keep this header anchored during route transitions (default: true). Disable for overlays that render a second header. */
  pinDuringRouteTransition?: boolean;
  /** Additional class names for the actions menu panel */
  actionMenuClassName?: string;
  /** Callback for settings button */
  onSettings?: () => void;
  /** Callback for help button */
  onHelp?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  showBack = false,
  leftContent,
  centerContent,
  rightContent,
  actionMenuContent,
  showActionsMenu = true,
  showSettings = true,
  showHelp = true,
  showNotifications = true,
  pinDuringRouteTransition = true,
  actionMenuClassName = '',
  onSettings,
  onHelp,
  className = '',
}) => {
  const { user, logout } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const hasUtilityButtons = showNotifications || (showHelp && Boolean(onHelp)) || (showSettings && Boolean(onSettings));

  return (
    <header
      className={`relative z-50 w-full mx-auto mb-6 sm:mb-10 h-16 flex items-center justify-between px-4 sm:px-8 max-w-7xl transition-all duration-500 ${pinDuringRouteTransition ? 'app-header-pinned' : ''} ${className}`.trim()}
    >
      {/* Left Content */}
      {leftContent ? (
        leftContent
      ) : (
        <div className="flex items-center gap-3 shrink-0">
          {showBack && (
            <TransitionLink
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </TransitionLink>
          )}
          <TransitionLink
            to="/"
            className="flex items-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
            title="Go to Home"
            aria-label="Go to home page"
          >
            <img
              src="/modlogo.png"
              alt="Origami logo"
              className="h-11 sm:h-14 w-auto object-contain"
            />
          </TransitionLink>
        </div>
      )}

      {/* Center Content */}
      {centerContent && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {centerContent}
        </div>
      )}

      {/* Right Content */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {rightContent && <div className="flex items-center gap-1 sm:gap-2 shrink-0">{rightContent}</div>}

        <div className="flex items-center gap-2 mr-2">
          {user ? (
            <div className="flex items-center gap-3 bg-white/5 pl-3 pr-1 py-1 rounded-full border border-white/10">
              <span className="text-sm text-white/80 max-w-[120px] truncate" title={user.email || 'User'}>
                {user.email}
              </span>
              <button
                onClick={() => logout()}
                className="p-1.5 rounded-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-600/80 hover:bg-cyan-500 text-white text-sm font-medium transition-colors"
            >
              <UserIcon className="w-4 h-4" />
              <span>Sign In</span>
            </button>
          )}
        </div>

        {hasUtilityButtons && (
          <div className="flex items-center gap-1">
            {showNotifications && <NotificationBell />}
            {showHelp && onHelp && (
              <button
                onClick={onHelp}
                className="p-2 rounded-lg text-white/70 bg-white/5 transition-all hover:text-white hover:bg-white/10"
                title="How to Use"
              >
                <CircleHelp className="w-5 h-5" />
              </button>
            )}
            {showSettings && onSettings && (
              <button
                onClick={onSettings}
                className="p-2 rounded-lg text-white/70 bg-white/5 transition-all hover:text-white hover:bg-white/10"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {showActionsMenu && (
          <>
            {(rightContent || hasUtilityButtons) && <div className="mx-1 h-6 w-px bg-white/10" />}
            <HeaderActionsMenu menuClassName={actionMenuClassName} renderContent={actionMenuContent} />
          </>
        )}
      </div>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </header>
  );
};
