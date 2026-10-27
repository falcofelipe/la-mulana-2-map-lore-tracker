/**
 * RaceTribeSelector Component
 * ---------------------------
 * Spoiler-free dropdown for selecting or inline-creating a Race / Tribe / People
 * tag on a comment entry. Starts empty for new playthroughs so players never
 * see spoilers until they manually add tribes they encounter.
 */

import React, { useState } from 'react';
import { Plus, Check, X, Users } from 'lucide-react';

interface RaceTribeSelectorProps {
  value: string;
  options: string[];
  onChange: (nextValue: string) => void;
  onAddNewOption: (newOption: string) => Promise<void>;
}

export const RaceTribeSelector: React.FC<RaceTribeSelectorProps> = ({
  value,
  options,
  onChange,
  onAddNewOption,
}) => {
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const handleConfirmAdd = async () => {
    const clean = customInput.trim();
    if (!clean) {
      setIsAddingCustom(false);
      return;
    }
    await onAddNewOption(clean);
    onChange(clean);
    setCustomInput('');
    setIsAddingCustom(false);
  };

  if (isAddingCustom) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConfirmAdd();
            } else if (e.key === 'Escape') {
              setIsAddingCustom(false);
            }
          }}
          placeholder="New Race/Tribe (e.g. Alfr)..."
          className="flex-1 min-w-[140px] bg-slate-950 border border-amber-500/60 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
          autoFocus
        />
        <button
          type="button"
          onClick={handleConfirmAdd}
          className="p-1 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
          title="Save & Select Race/Tribe"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={() => setIsAddingCustom(false)}
          className="p-1 rounded bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700"
          title="Cancel"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative flex-1">
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === '__ADD_NEW__') {
              setIsAddingCustom(true);
            } else {
              onChange(e.target.value);
            }
          }}
          className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
        >
          <option value="">
            {options.length === 0
              ? '— No Race/Tribe (Click + to add spoiler-free) —'
              : '— None / Unspecified —'}
          </option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          {/* Ensure current value is visible even if not in options */}
          {value && !options.includes(value) && (
            <option value={value}>{value}</option>
          )}
          <option value="__ADD_NEW__">+ Add New Race / Tribe...</option>
        </select>
      </div>

      <button
        type="button"
        onClick={() => setIsAddingCustom(true)}
        className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs shrink-0"
        title="Add a new Race / Tribe / People option to dropdown"
      >
        <Users size={12} />
        <Plus size={12} />
      </button>
    </div>
  );
};
