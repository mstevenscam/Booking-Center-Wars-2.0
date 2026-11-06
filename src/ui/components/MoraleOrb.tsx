/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Supervisor Morale & Profile Component
 */

import React from 'react';
import { Shield, Heart, Zap, UserCheck, Flame } from 'lucide-react';
import { PlayerStateView } from '../types';
import { getDepartmentColor } from './CardView';

interface MoraleOrbProps {
  player: PlayerStateView;
  isOpponent?: boolean;
  isActiveTurn?: boolean;
  onDirectAttackTarget?: () => void;
  canBeDirectlyAttacked?: boolean;
}

export const MoraleOrb: React.FC<MoraleOrbProps> = ({
  player,
  isOpponent = false,
  isActiveTurn = false,
  onDirectAttackTarget,
  canBeDirectlyAttacked = false
}) => {
  const percentage = Math.max(0, Math.min(100, (player.morale / player.maxMorale) * 100));
  const deptBadgeClass = getDepartmentColor(player.department);

  return (
    <div className={`relative flex items-center gap-3 p-2.5 rounded-2xl transition-all duration-300 card-tactile-depth ${
      isActiveTurn ? 'bg-slate-900/90 ring-1 ring-amber-400/50' : 'bg-slate-950/80 border border-slate-800'
    } ${canBeDirectlyAttacked ? 'ring-2 ring-red-500 cursor-pointer hover:bg-red-950/40 animate-pulse' : ''}`}
      onClick={canBeDirectlyAttacked ? onDirectAttackTarget : undefined}
      title={canBeDirectlyAttacked ? 'Click to declare direct attack on Supervisor!' : undefined}
    >
      {/* Supervisor Avatar / Morale Gauge Orb */}
      <div className="relative shrink-0 w-14 h-14 rounded-2xl overflow-hidden border-2 border-slate-700 bg-slate-900 flex items-center justify-center">
        {/* Department gradient bg */}
        <div className={`absolute inset-0 bg-gradient-to-br ${player.avatarGradient} opacity-80`} />
        
        {/* Supervisor silhouette icon */}
        <div className="relative z-10 flex flex-col items-center justify-center text-white">
          <UserCheck className="w-6 h-6 drop-shadow" />
        </div>

        {/* Dynamic Low Morale Warning Flame */}
        {percentage < 30 && (
          <div className="absolute top-1 right-1 z-20 text-rose-400 animate-bounce">
            <Flame className="w-3.5 h-3.5 fill-rose-500" />
          </div>
        )}

        {/* Turn Active Halo Indicator */}
        {isActiveTurn && (
          <div className="absolute inset-0 border-2 border-amber-400 rounded-2xl animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Details & Morale Bar */}
      <div className="min-w-[140px] sm:min-w-[180px]">
        <div className="flex items-center justify-between gap-1">
          <div className="font-bold text-xs text-slate-100 truncate">{player.name}</div>
          <span className={`text-[8px] uppercase font-bold px-1 rounded border ${deptBadgeClass}`}>
            {player.department}
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-medium truncate">{player.title}</div>

        {/* Morale Progress Bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-3.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700/60 flex items-center">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                percentage > 50 
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                  : percentage > 25 
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400' 
                    : 'bg-gradient-to-r from-rose-600 to-red-500 animate-pulse'
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex items-center gap-0.5 text-xs font-black">
            <Heart className={`w-3.5 h-3.5 ${percentage > 30 ? 'text-emerald-400 fill-emerald-400' : 'text-rose-500 fill-rose-500'}`} />
            <span className={percentage > 30 ? 'text-slate-100' : 'text-rose-400'}>
              {player.morale}
            </span>
            <span className="text-slate-500 font-normal text-[10px]">/{player.maxMorale}</span>
          </div>
        </div>
      </div>

      {/* Direct Attack Reticle Prompt */}
      {canBeDirectlyAttacked && (
        <div className="absolute -top-3 -right-2 px-2 py-0.5 bg-red-600 text-white text-[9px] font-black rounded-full shadow-lg border border-red-300 animate-bounce">
          DIRECT STRIKE TARGET
        </div>
      )}
    </div>
  );
};
