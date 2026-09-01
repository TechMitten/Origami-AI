import { setSyncedPreference } from '../services/preferences';
import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { AudioLines, BookOpen, Bot, Clapperboard, FileCog, Film, Settings, User } from 'lucide-react';
import { useLocation } from 'react-router';
import { TransitionNavLink, useTransitionNavigate } from './TransitionLink';
import { useAuth } from '../context/AuthContext';

interface HeaderActionsMenuProps {
  className?: string;
  menuClassName?: string;
  showAppRoutes?: boolean;
  renderContent?: (closeMenu: () => void) => ReactNode;
}

const menuItemClassName = 'flex w-full items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors';

export const HeaderActionsMenu: React.FC<HeaderActionsMenuProps> = ({
  className = '',
  menuClassName = '',
  showAppRoutes = true,
  renderContent,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useTransitionNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const closeMenu = () => setIsOpen(false);
  const customContent = renderContent?.(closeMenu);

  const showLandingPage = () => {
    closeMenu();
    // The Studio reads this flag when it mounts, so the lander also shows when
    // this is triggered from another route; the event covers the case where the
    // Studio is already on screen.
    setSyncedPreference('has_seen_welcome_lander', 'false');
    window.dispatchEvent(new Event('show-welcome-lander'));
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  return (
    <div className={`relative z-60 ${className}`.trim()}>
      <button
        onClick={() => setIsOpen((current) => !current)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition-all ${isOpen ? 'border-white/20 bg-white/10 text-white' : 'border-transparent text-white/60 hover:border-white/10 hover:bg-white/5 hover:text-white'}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <span className="hidden sm:inline">Actions</span>
        <Settings className="h-4 w-4 sm:hidden" />
        <svg className={`hidden h-4 w-4 transition-transform duration-200 sm:block ${isOpen ? 'rotate-180 text-white' : 'opacity-50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[-1] cursor-default"
          onClick={closeMenu}
        />
      )}

      {isOpen && (
        <div className={`absolute right-0 top-full mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#18181b] py-1 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200 origin-top-right z-60 ${menuClassName}`.trim()}>
          {showAppRoutes && (
            <>
              <TransitionNavLink
                to="/"
                end
                onClick={closeMenu}
                className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              >
                <Clapperboard className="h-4 w-4" /> Studio
              </TransitionNavLink>

              <TransitionNavLink
                to="/assistant"
                onClick={closeMenu}
                className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              >
                <Bot className="h-4 w-4" /> Assistant
              </TransitionNavLink>

              <TransitionNavLink
                to="/shorts"
                onClick={closeMenu}
                className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              >
                <Film className="h-4 w-4" /> Shorts
              </TransitionNavLink>

              <TransitionNavLink
                to="/voice"
                onClick={closeMenu}
                className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              >
                <AudioLines className="h-4 w-4" /> Voice Studio
              </TransitionNavLink>

              <TransitionNavLink
                to="/convert"
                onClick={closeMenu}
                className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
              >
                <FileCog className="h-4 w-4" /> File Studio
              </TransitionNavLink>

              <button
                onClick={showLandingPage}
                className={`${menuItemClassName} text-white/70 hover:bg-white/5 hover:text-white`}
              >
                <BookOpen className="h-4 w-4" /> Landing Page
              </button>

              {user && (
                <>
                  <div className="my-1 h-px bg-white/10" />
                  <TransitionNavLink
                    to="/account"
                    onClick={closeMenu}
                    className={({ isActive }) => `${menuItemClassName} ${isActive ? 'bg-cyan-400/15 text-cyan-100' : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                  >
                    <User className="h-4 w-4" /> Account
                  </TransitionNavLink>
                </>
              )}
            </>
          )}

          {showAppRoutes && customContent && <div className="my-1 h-px bg-white/10" />}
          {customContent}
        </div>
      )}
    </div>
  );
};