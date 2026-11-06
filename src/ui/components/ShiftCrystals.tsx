/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Shift Mana Crystals Tray Component
 */

import React from 'react';
import { Zap } from 'lucide-react';

interface ShiftCrystalsProps {
  available: number;
  capacity: number;
  isPlayer?: boolean;
}

export const ShiftCrystals: React.FC<ShiftCrystalsProps> = ({
  available,
  capacity,
  isPlayer = true
}) => {
  const crystalSockets = Array.from({ length: 10 }, (_, i) => i);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-950/95 border-2 border-slate-800 shadow-xl card-tactile-depth select-none">
      {/* Numerical Counter */}
      <div className="flex items-center gap-1 pr-1 border-r border-slate-800">
        <Zap className="w-4 h-4 fill-amber-400 text-amber-400" />
        <div className="flex items-baseline font-mono font-black">
          <span className="text-sm sm:text-base text-amber-400">{available}</span>
          <span className="text-[10px] text-slate-500">/{capacity}</span>
        </div>
      </div>

      {/* 10 Faceted Crystals Tray */}
      <div className="flex items-center gap-1">
        {crystalSockets.map((index) => {
          const isUnlocked = index < capacity;
          const isCharged = index < available;

          if (!isUnlocked) {
            return (
              <div
                key={index}
                className="w-2 sm:w-2.5 h-4 sm:h-5 rounded-xs bg-slate-900 border border-slate-800/80 opacity-20"
                title={`Locked capacity (${index + 1})`}
              />
            );
          }

          return (
            <div
              key={index}
              className={`w-2.5 sm:w-3 h-4 sm:h-5 rounded-xs transition-all duration-300 border ${
                isCharged
                  ? 'bg-gradient-to-t from-amber-600 via-amber-400 to-amber-200 border-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.8)]'
                  : 'bg-slate-900/90 border-slate-700/60 opacity-40 shadow-inner'
              }`}
              title={isCharged ? `Charged Shift point` : `Spent Shift point`}
            />
          );
        })}
      </div>

      <span className="text-[9px] font-black text-amber-400/90 tracking-widest uppercase hidden lg:inline">
        SHIFT
      </span>
    </div>
  );
};
