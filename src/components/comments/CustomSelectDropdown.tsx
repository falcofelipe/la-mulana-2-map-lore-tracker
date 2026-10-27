/**
 * CustomSelectDropdown Component
 * ------------------------------
 * Renders a dropdown `<select>` for user-defined `'select'` custom fields,
 * complete with an inline "+ Add Option..." mode so players can add new
 * dropdown choices on the fly from either the Comments Table or Room Inspector.
 */

import React, { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';

interface CustomSelectDropdownProps {
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (nextValue: string) => void;
  onAddNewOption?: (newOption: string) => Promise<void>;
  compact?: boolean;
}

export const CustomSelectDropdown: React.FC<CustomSelectDropdownProps> = ({
  value,
  options,
  placeholder = '—',
  onChange,
  onAddNewOption,
  compact = false,
}) => {
  const [isAddingOption, setIsAddingOption] = useState(false);
  const [newOptionText, setNewOptionText] = useState('');

  const handleConfirmAdd = async () => {
    const clean = newOptionText.trim();
    if (!clean) {
      setIsAddingOption(false);
      return;
    }
    if (onAddNewOption) {
      await onAddNewOption(clean);
    }
    onChange(clean);
    setNewOptionText('');
    setIsAddingOption(false);
  };

  if (isAddingOption) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newOptionText}
          onChange={(e) => setNewOptionText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirmAdd();
            } else if (e.key === 'Escape') {
              setNewOptionText('');
              setIsAddingOption(false);
            }
          }}
          placeholder="New option..."
          className="flex-1 min-w-[90px] bg-slate-950 border border-amber-500/60 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={handleConfirmAdd}
          className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 shrink-0"
          title="Save & Select Option"
        >
          <Check size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            setNewOptionText('');
            setIsAddingOption(false);
          }}
          className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 shrink-0"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === '__ADD_NEW_OPTION__') {
            setIsAddingOption(true);
          } else {
            onChange(e.target.value);
          }
        }}
        className={`w-full bg-slate-950/90 border border-slate-800 focus:border-amber-400 rounded px-2 py-1 text-slate-200 focus:outline-none ${
          compact ? 'text-[11px]' : 'text-xs'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        {value && !options.includes(value) && (
          <option value={value}>{value}</option>
        )}
        {onAddNewOption && (
          <option value="__ADD_NEW_OPTION__">+ Add Option...</option>
        )}
      </select>

      {onAddNewOption && !compact && (
        <button
          type="button"
          onClick={() => setIsAddingOption(true)}
          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 shrink-0"
          title="Add a new option to this dropdown"
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
};
