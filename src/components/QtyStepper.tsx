'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface QtyStepperProps {
  value: number;
  /**
   * Called with the committed new quantity. Pass min=0 and handle
   * next <= 0 by removing the line, per each screen's convention.
   */
  onChange: (next: number) => void;
  /** Lowest value reachable via +/- buttons (default 1). */
  min?: number;
  max?: number;
}

/**
 * Editable quantity stepper: [-] [ 5 ] [+]
 * The cashier can type any quantity directly and commit with Enter or by
 * clicking away. Invalid input reverts; quantities below 1 are passed to the
 * parent so it can remove the line (or clamp) per its own convention.
 */
const QtyStepper: React.FC<QtyStepperProps> = ({ value, onChange, min = 1, max = 999 }) => {
  const [draft, setDraft] = useState<string>(String(value));
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the field in sync when the value changes externally (+/- clicks).
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    let parsed = parseInt(draft.trim(), 10);
    if (!Number.isFinite(parsed) || String(parsed) !== draft.trim()) {
      // Reject decimals/garbage - restore current value.
      setDraft(String(value));
      return;
    }
    if (parsed > max) parsed = max;
    if (parsed === value) {
      setDraft(String(value));
      return;
    }
    onChange(Math.max(0, parsed));
  };

  return (
    <div className="inline-flex items-center border border-slate-300 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
        aria-label="Decrease quantity"
      >
        <Minus size={12} />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onFocus={() => setEditing(true)}
        onChange={e => {
          if (/^\d*$/.test(e.target.value)) setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(String(value));
            setEditing(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="w-10 text-center text-xs font-bold text-slate-800 py-1 focus:outline-none focus:bg-indigo-50"
        aria-label="Quantity"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
        aria-label="Increase quantity"
      >
        <Plus size={12} />
      </button>
    </div>
  );
};

export default QtyStepper;
