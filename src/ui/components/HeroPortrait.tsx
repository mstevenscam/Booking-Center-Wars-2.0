/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Hero / Supervisor Portrait Component
 */

import React from 'react';
import { Heart, UserCheck, Flame, Shield, Swords } from 'lucide-react';
import { PlayerStateView } from '../types';
import { getDepartmentColor } from './CardView';

interface HeroPortraitProps {
  player: PlayerStateView;
  isOpponent?: boolean;
  isActiveTurn?: boolean;
  canBeDirectlyAttacked?: boolean;
  onDirectAttack?: () => void;
  damagePopupText?: string | null;
}

export const HeroPortrait: React.FC<HeroPortraitProps> = ({
  player,
  isOpponent = false,
  isActiveTurn = false,
  canBeDirectlyAttacked = false,
  onDirectAttack,
  damagePopupText
}) => {
  const percentage = Math.max(0, Math.min(100, (player.morale / player.maxMorale) * 100));
  const deptBadgeClass = getDepartmentColor(player.department);

  return (
    <div 
      className={`relative flex flex-col items-center select-none group transition-transform ${
        canBeDirectlyAttacked ? 'cursor-pointer hover:scale-105' : ''
      }`}
      onClick={canBeDirectlyAttacked ? onDirectAttack : undefined}
      title={canBeDirectlyAttacked ? 'Click to declare direct attack on Supervisor!' : undefined}
    >
      {/* Floating Damage Popup on Hero */}
      {damagePopupText && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-rose-600 text-white font-black text-xs shadow-2xl border-2 border-rose-300 anim-float-damage whitespace-nowrap">
          {damagePopupText}
        </div>
      )}

      {/* Target Reticle Badge */}
      {canBeDirectlyAttacked && (
        <div className="absolute -top-4 z-40 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black tracking-wider uppercase shadow-xl border border-red-300 animate-bounce flex items-center gap-1">
          <Swords className="w-3 h-3" />
          DIRECT TARGET
        </div>
      )}

      {/* Oval Hero Frame */}
      <div className={`relative w-20 sm:w-24 md:w-28 h-24 sm:h-28 md:h-32 rounded-[2.5rem] border-4 overflow-hidden shadow-2xl flex items-center justify-center transition-all ${
        isOpponent 
          ? 'border-rose-700 bg-gradient-to-b from-rose-950 via-slate-900 to-slate-950' 
          : 'border-amber-500 bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950'
      } ${
        isActiveTurn ? 'ring-4 ring-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.7)]' : ''
      } ${
        canBeDirectlyAttacked ? 'ring-4 ring-red-500 shadow-[0_0_30px_rgba(239,68,68,0.85)] animate-pulse' : ''
      }`}>
        {/* Department Gradient Background */}
        <div className={`absolute inset-0 bg-gradient-to-br ${player.avatarGradient} opacity-75`} />

        {/* Supervisor Icon Avatar */}
        <div className="relative z-10 flex flex-col items-center justify-center text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)]">
          <UserCheck className="w-10 sm:w-12 h-10 sm:h-12" />
        </div>

        {/* Critical Low Morale Warning Flame */}
        {percentage < 30 && (
          <div className="absolute top-1 right-2 z-20 text-rose-400 animate-bounce">
            <Flame className="w-4 h-4 fill-rose-500 drop-shadow" />
          </div>
        )}

        {/* Turn Active Halo */}
        {isActiveTurn && (
          <div className="absolute inset-0 border-2 border-amber-300 rounded-[2.3rem] animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Hero Nameplate Ribbon */}
      <div className="-mt-3 relative z-20 px-2.5 py-0.5 rounded-full bg-slate-950/95 border border-amber-500/50 shadow-md text-center max-w-[140px] sm:max-w-[160px]">
        <div className="text-[10px] sm:text-[11px] font-black text-slate-100 truncate tracking-tight">
          {player.name}
        </div>
        <div className="text-[8px] text-amber-400 font-bold uppercase tracking-widest truncate">
          {player.title}
        </div>
      </div>

      {/* Hearthstone-Style Large Morale (Health) Orb — Bottom Right */}
      <div 
        className={`absolute bottom-2 -right-2 z-30 w-8 sm:w-10 h-8 sm:h-10 rounded-full border-2 shadow-2xl flex items-center justify-center text-white font-black text-xs sm:text-base font-mono drop-shadow-[0_4px_6px_rgba(0,0,0,0.9)] transition-all ${
          percentage > 50 
            ? 'bg-gradient-to-br from-emerald-400 via-green-600 to-teal-800 border-emerald-200' 
            : percentage > 25 
              ? 'bg-gradient-to-br from-amber-400 via-orange-600 to-amber-800 border-amber-200' 
              : 'bg-gradient-to-br from-rose-500 via-red-600 to-rose-900 border-rose-300 animate-pulse'
        }`}
        title={`Supervisor Morale: ${player.morale} / ${player.maxMorale}`}
      >
        <span className="leading-none drop-shadow">{player.morale}</span>
      </div>
    </div>
  );
};
