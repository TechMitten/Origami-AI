import React from 'react';

export interface PickerOption {
  id: string;
  label: string;
  disabled?: boolean;
}

interface TargetPickerProps {
  options: readonly PickerOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Accessible name for the group, e.g. 'Output format'. */
  ariaLabel: string;
}

/** Chip row used for both the output format and the bitrate selects. */
export const TargetPicker: React.FC<TargetPickerProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel,
}) => (
  <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
    {options.map((option) => {
      const isSelected = option.id === value;
      const isDisabled = disabled || option.disabled;
      return (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={isSelected}
          disabled={isDisabled}
          onClick={() => onChange(option.id)}
          className={[
            'focus-ring rounded-xl border px-4 py-2 text-sm font-semibold transition-colors',
            isSelected
              ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-200'
              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
            isDisabled ? 'cursor-not-allowed opacity-40 hover:bg-white/5 hover:text-white/60' : '',
          ].join(' ')}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
