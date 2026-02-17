import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="max-w-7xl mx-auto mt-auto py-6 border-t border-white/5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4">
        <a
          href="https://islandapps.dev"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
        >
          &copy; {new Date().getFullYear()} Island Applications
        </a>
        <div className="flex items-center gap-4">
          <Link
            to="/privacy"
            className="text-white/40 hover:text-white transition-colors text-[10px] font-bold uppercase tracking-[0.2em]"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
};
