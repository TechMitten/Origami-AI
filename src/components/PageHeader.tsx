import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Github, Settings, CircleHelp } from 'lucide-react';
import appLogo from '../assets/images/app-logo2.png';
import { AppModeSwitcher } from './AppModeSwitcher';

interface PageHeaderProps {
  /** Title to display next to logo, e.g., "Issue Reporter" or "AI Assistant" */
  title?: string;
  /** Show back button or custom left content */
  showBack?: boolean;
  /** Custom left content (overrides default logo + title) */
  leftContent?: ReactNode;
  /** Custom center content */
  centerContent?: ReactNode;
  /** Custom right content */
  rightContent?: ReactNode;
  /** Show mode switcher on the right (default: true) */
  showModeSwitcher?: boolean;
  /** Show settings button (default: true) */
  showSettings?: boolean;
  /** Show help button (default: true) */
  showHelp?: boolean;
  /** Show github button (default: true) */
  showGithub?: boolean;
  /** Callback for settings button */
  onSettings?: () => void;
  /** Callback for help button */
  onHelp?: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  showBack = false,
  leftContent,
  centerContent,
  rightContent,
  showModeSwitcher = true,
  showSettings = true,
  showHelp = true,
  showGithub = true,
  onSettings,
  onHelp,
  className = '',
}) => {
  return (
    <header
      className={`relative z-50 w-full mx-auto mb-10 h-16 flex items-center justify-between px-4 sm:px-6 lg:px-8 max-w-7xl transition-all duration-500 ${className}`.trim()}
    >
      {/* Left Content */}
      {leftContent ? (
        leftContent
      ) : (
        <div className="flex items-center gap-3 shrink-0">
          {showBack && (
            <Link
              to="/"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
          )}
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 transition-all duration-500 hover:scale-105">
            <img src={appLogo} alt="Logo" className="w-full h-full object-cover rounded-xl" />
          </div>
          {title && (
            <h1 className="hidden sm:block text-xl sm:text-2xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-linear-to-r from-cyan-400 via-blue-500 to-purple-600 drop-shadow-sm">
              {title}
            </h1>
          )}
        </div>
      )}

      {/* Center Content */}
      {centerContent && <div className="flex-1 flex justify-center">{centerContent}</div>}

      {/* Right Content */}
      {rightContent ? (
        rightContent
      ) : (
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {showModeSwitcher && <AppModeSwitcher className="mr-1" />}

          <div className="flex items-center gap-1">
            {showGithub && (
              <a
                href="https://github.com/IslandApps/Origami-AI"
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg text-white/70 bg-white/5 transition-all hover:text-white hover:bg-white/10"
                title="View on GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
            )}
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
        </div>
      )}
    </header>
  );
};
