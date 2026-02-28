import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DropdownOption {
  id: string;
  name: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export const Dropdown: React.FC<DropdownProps> = ({ options, value, onChange, className, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const selectedOption = options.find(o => o.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        isOpen && 
        containerRef.current && !containerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    
    // Handle scroll to close dropdown to avoid detachment, but allow scrolling inside menu
    const handleScroll = (event: Event) => {
      if (menuRef.current && menuRef.current.contains(event.target as Node)) {
        return;
      }
      if (isOpen) setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, { capture: true });
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640; // sm breakpoint
      setCoords({
        top: rect.bottom + window.scrollY + 8,
        left: isMobile ? 0 : rect.left + window.scrollX,
        width: isMobile ? window.innerWidth : rect.width
      });
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between px-4 py-2 rounded-lg border border-white/10 text-white text-sm outline-none cursor-pointer hover:border-branding-primary/30 transition-all focus:border-branding-primary/50"
        style={{ backgroundColor: '#18181b' }}
      >
        <span className="truncate">{selectedOption?.name || placeholder || 'Select option'}</span>
        <ChevronDown className={cn("w-4 h-4 text-white/40 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && createPortal(
        <div 
          ref={menuRef}
          className="fixed py-2 border border-white/10 rounded-xl shadow-2xl"
          style={{ 
            position: 'absolute',
            top: coords.top,
            left: coords.left,
            width: coords.width,
            backgroundColor: '#18181b', // Hardcoded solid background
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.8)',
            isolation: 'isolate',
            zIndex: 9999
          }}
        >
          <div className="max-h-60 sm:max-h-80 overflow-y-auto custom-scrollbar">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onChange(option.id);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left px-4 py-3 min-h-11 text-sm transition-colors hover:bg-white/5",
                  option.id === value ? "text-branding-primary font-bold bg-branding-primary/5" : "text-white/80 hover:text-white"
                )}
              >
                {option.name}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
