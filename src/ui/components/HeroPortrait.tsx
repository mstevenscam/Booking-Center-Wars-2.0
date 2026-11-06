/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Hero / Supervisor Portrait Component
 * 
 * Commercial-grade visual depth: Sculpted metallic bezel, department crest,
 * faceted Morale jewel, active shift aura, and touch-friendly target states.
 */

import React from 'react';
import { Heart, UserCheck, Flame, Shield, Swords, Wrench, FileCheck, Award } from 'lucide-react';
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

  // Character-specific iconic asset
  const HeroIcon = isOpponent ? FileCheck : Wrench;

  return (
    <div 
      className={`relative flex flex-col items-center select-none group transition-transform ${
        canBeDirectlyAttacked ? 'cursor-pointer hover:scale-105 active:scale-95' : ''
      }`}
      onClick={canBeDirectlyAttacked ? onDirectAttack : undefined}
      title={canBeDirectlyAttacked ? 'Tap to declare direct strike on Supervisor!' : `${player.name} (${player.title})`}
    >
      {/* Floating Damage Popup on Hero (Clearly labeled as mock demo prediction) */}
      {damagePopupText && (
        <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-rose-600 text-white font-black text-xs shadow-2xl border-2 border-rose-300 anim-float-damage whitespace-nowrap flex flex-col items-center leading-none">
          <span>{damagePopupText}</span>
          <span className="text-[7px] text-amber-200 uppercase font-mono tracking-wider mt-0.5">EST. (MOCK DEMO)</span>
        </div>
      )}

      {/* Target Reticle Badge */}
      {canBeDirectlyAttacked && (
        <div className="absolute -top-5 z-40 px-3 py-0.5 rounded-full bg-red-600 text-white text-[9px] sm:text-[10px] font-black tracking-wider uppercase shadow-2xl border-2 border-red-300 animate-bounce flex items-center gap-1">
          <Swords className="w-3 h-3" />
          <span>DIRECT STRIKE TARGET</span>
        </div>
      )}

      {/* Outer Sculpted Hero Frame with 3D Depth */}
      <div className={`relative w-22 sm:w-26 md:w-30 h-26 sm:h-30 md:h-34 rounded-[2.8rem] border-4 overflow-hidden shadow-2xl flex items-center justify-center transition-all ${
        isOpponent 
          ? 'border-rose-600/90 bg-gradient-to-b from-rose-950 via-slate-900 to-slate-950 shadow-[0_10px_25px_rgba(0,0,0,0.8)]' 
          : 'border-amber-400/90 bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 shadow-[0_10px_25px_rgba(0,0,0,0.8)]'
      } ${
        isActiveTurn ? 'ring-4 ring-amber-400 shadow-[0_0_35px_rgba(245,158,11,0.8)]' : ''
      } ${
        canBeDirectlyAttacked ? 'ring-4 ring-red-500 shadow-[0_0_35px_rgba(239,68,68,0.9)] animate-pulse' : ''
      }`}>
        {/* Department Gradient Texture & Ambient Light */}
        <div className={`absolute inset-0 bg-gradient-to-br ${player.avatarGradient} opacity-80`} />
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:6px_6px]" />

        {/* Hero Character Emblem Silhouette */}
        <div className="relative z-10 flex flex-col items-center justify-center text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]">
          <HeroIcon className="w-11 sm:w-13 md:w-14 h-11 sm:h-13 md:h-14 transform group-hover:scale-105 transition-transform duration-200" />
        </div>

        {/* Low Morale Warning Flame */}
        {percentage < 30 && (
          <div className="absolute top-1.5 right-2.5 z-20 text-rose-400 animate-bounce">
            <Flame className="w-4 h-4 fill-rose-500 drop-shadow" />
          </div>
        )}

        {/* Turn Active Shimmer Ring */}
        {isActiveTurn && (
          <div className="absolute inset-0 border-2 border-amber-300/80 rounded-[2.6rem] animate-pulse pointer-events-none" />
        )}
      </div>

      {/* Hero Nameplate Ribbon */}
      <div className="-mt-3.5 relative z-20 px-3 py-0.5 rounded-full bg-slate-950/98 border border-amber-500/60 shadow-xl text-center max-w-[150px] sm:max-w-[170px]">
        <div className="text-[10px] sm:text-[11px] font-black text-slate-100 truncate tracking-tight">
          {player.name}
        </div>
        <div className="text-[8px] text-amber-400 font-bold uppercase tracking-widest truncate">
          {player.title}
        </div>
      </div>

      {/* Hearthstone-Style Large Morale (Health) Jewel — Bottom Right */}
      <div 
        className={`absolute bottom-2 -right-2 z-30 w-9 sm:w-11 h-9 sm:h-11 rounded-full border-2 shadow-2xl flex items-center justify-center text-white font-black text-xs sm:text-base font-mono drop-shadow-[0_4px_8px_rgba(0,0,0,0.95)] transition-all ${
          percentage > 50 
            ? 'bg-gradient-to-br from-emerald-400 via-green-600 to-teal-800 border-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.5)]' 
            : percentage > 25 
              ? 'bg-gradient-to-br from-amber-400 via-orange-600 to-amber-800 border-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)]' 
              : 'bg-gradient-to-br from-rose-500 via-red-600 to-rose-900 border-rose-300 animate-pulse shadow-[0_0_16px_rgba(239,68,68,0.8)]'
        }`}
        title={`Supervisor Morale: ${player.morale} / ${player.maxMorale}`}
      >
        <span className="leading-none drop-shadow">{player.morale}</span>
      </div>
    </div>
  );
};
