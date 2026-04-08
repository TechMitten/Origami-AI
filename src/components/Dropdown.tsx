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
  group?: string;
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
  const groupedOptions = options.reduce<Array<{ group?: string; options: DropdownOption[] }>>((groups, option) => {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.group === option.group) {
      lastGroup.options.push(option);
      return groups;
    }

    groups.push({
      group: option.group,
      options: [option],
    });
    return groups;
  }, []);

  const updatePosition = () => {
    if (menuRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isMobile = window.innerWidth < 640;
      menuRef.current.style.top = `${rect.bottom + 8}px`;
      menuRef.current.style.left = `${isMobile ? 0 : rect.left}px`;
      menuRef.current.style.width = `${isMobile ? window.innerWidth : rect.width}px`;
    }
  };

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

    const handleScroll = () => {
      updatePosition();
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      // Set initial position after menu is rendered
      setTimeout(() => updatePosition(), 0);
    } else {
      setIsOpen(false);
    }
  };

  // Set initial position when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      updatePosition();
    }
  }, [isOpen]);

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
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            backgroundColor: '#18181b',
            boxShadow: '0 10px 40px -10px rgba(0,0,0,0.8)',
            isolation: 'isolate',
            zIndex: 9999
          }}
        >
          <div className="max-h-60 sm:max-h-80 overflow-y-auto custom-scrollbar">
            {groupedOptions.map((group, groupIndex) => (
              <div key={`${group.group || 'ungrouped'}-${groupIndex}`}>
                {group.group && (
                  <div className="px-4 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
                    {group.group}
                  </div>
                )}
                {group.options.map((option) => (
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
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
