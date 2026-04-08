import React from 'react';
import { Bot, Bug, Clapperboard } from 'lucide-react';
import { NavLink } from 'react-router-dom';

interface AppModeSwitcherProps {
  className?: string;
}

const baseItemClassName = 'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-all';

export const AppModeSwitcher: React.FC<AppModeSwitcherProps> = ({ className = '' }) => {
  return (
    <div className={`flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1 backdrop-blur-md ${className}`.trim()}>
      <NavLink
        to="/"
        end
        className={({ isActive }) => `${baseItemClassName} ${isActive ? 'bg-white text-black shadow-sm' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
      >
        <Clapperboard className="h-4 w-4" />
        <span className="hidden sm:inline">Studio</span>
      </NavLink>
      <NavLink
        to="/assistant"
        className={({ isActive }) => `${baseItemClassName} ${isActive ? 'bg-cyan-400 text-slate-950 shadow-sm shadow-cyan-500/20' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
      >
        <Bot className="h-4 w-4" />
        <span className="hidden sm:inline">Assistant</span>
      </NavLink>
      <NavLink
        to="/issue-reporter"
        className={({ isActive }) => `${baseItemClassName} ${isActive ? 'bg-orange-300 text-slate-950 shadow-sm shadow-orange-500/20' : 'text-white/55 hover:bg-white/10 hover:text-white'}`}
      >
        <Bug className="h-4 w-4" />
        <span className="hidden sm:inline">Issues</span>
      </NavLink>
    </div>
  );
};
