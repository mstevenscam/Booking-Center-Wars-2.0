/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Polish Phase V1.1 — Shift Resource Meter Component
 */

import React from 'react';
import { Zap } from 'lucide-react';

interface ShiftResourceMeterProps {
  available: number;
  capacity: number;
  side?: 'player' | 'opponent';
}

export const ShiftResourceMeter: React.FC<ShiftResourceMeterProps> = ({
  available,
  capacity,
  side = 'player'
}) => {
  const cells = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-slate-950/90 border border-slate-800 card-tactile-depth">
      {/* Icon and numerical counter */}
      <div className="flex items-center gap-1">
        <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
          <Zap className="w-3 sm:w-3.5 h-3 sm:h-3.5 fill-amber-400" />
        </div>
        <div className="flex items-baseline">
          <span className="font-black text-xs sm:text-sm text-amber-400 font-mono">{available}</span>
          <span className="text-[9px] sm:text-[10px] text-slate-500 font-semibold font-mono">/{capacity}</span>
        </div>
      </div>

      {/* Tactile Power Crystals */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {cells.map((index) => {
          const isUnlocked = index < capacity;
          const isCharged = index < available;

          if (!isUnlocked) {
            return (
              <div
                key={index}
                className="w-2 sm:w-2.5 h-3.5 sm:h-4 rounded-xs bg-slate-900 border border-slate-800/60 opacity-25"
                title={`Locked capacity (${index + 1})`}
              />
            );
          }

          return (
            <div
              key={index}
              className={`w-2 sm:w-2.5 h-3.5 sm:h-4 rounded-xs transition-all duration-300 border ${
                isCharged
                  ? 'bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 border-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.7)]'
                  : 'bg-slate-800/90 border-slate-700/80 opacity-60'
              }`}
              title={isCharged ? `Charged Shift point` : `Spent Shift point`}
            />
          );
        })}
      </div>

      <div className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase tracking-widest hidden md:block">
        SHIFT
      </div>
    </div>
  );
};
