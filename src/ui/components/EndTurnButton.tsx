/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style 3D Tactile End Turn Button Component
 */

import React from 'react';
import { ChevronRight, Clock, Check } from 'lucide-react';
import { TurnPhase } from '../types';

interface EndTurnButtonProps {
  isPlayerTurn: boolean;
  activePhase: TurnPhase;
  onAdvancePhase: () => void;
}

export const EndTurnButton: React.FC<EndTurnButtonProps> = ({
  isPlayerTurn,
  activePhase,
  onAdvancePhase
}) => {
  const isActionPhase = activePhase === 'OPERATIONAL_ACTION';

  return (
    <div className="flex flex-col items-center select-none">
      <button
        onClick={onAdvancePhase}
        className={`relative w-28 sm:w-34 md:w-38 h-12 sm:h-14 md:h-16 rounded-2xl font-black text-xs sm:text-sm tracking-wider uppercase border-2 flex flex-col items-center justify-center cursor-pointer transition-all ${
          isPlayerTurn 
            ? 'btn-3d-active text-slate-950 border-amber-200' 
            : 'btn-3d-inactive text-slate-400 border-slate-700'
        }`}
      >
        <span className="leading-none drop-shadow-xs font-black">
          {isActionPhase ? 'END TURN' : 'NEXT PHASE'}
        </span>
        <span className="text-[8px] sm:text-[9px] font-bold opacity-80 mt-0.5 tracking-tight">
          {activePhase.replace('_', ' ')}
        </span>
      </button>
    </div>
  );
};
