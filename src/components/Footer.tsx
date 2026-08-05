import React from 'react';
import { Github } from 'lucide-react';
import { TransitionLink } from './TransitionLink';

export const Footer: React.FC = () => {
  return (
    <footer className="max-w-7xl mx-auto mt-auto py-6 border-t border-white/5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-4">
          <a
            href="https://techmitten.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            &copy; {new Date().getFullYear()} TechMitten LLC
          </a>
          <a
            href="https://github.com/TechMitten/Origami-AI"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 hover:text-white transition-colors flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em]"
            title="View on GitHub"
          >
            <Github className="w-3.5 h-3.5" />
            GitHub
          </a>
        </div>
        <div className="flex items-center gap-4">
          <TransitionLink
            to="/privacy"
            className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Privacy Policy
          </TransitionLink>
          <TransitionLink
            to="/terms"
            className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Terms of Service
          </TransitionLink>
        </div>
      </div>
    </footer>
  );
};
