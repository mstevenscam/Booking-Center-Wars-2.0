/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Minion Tile on the Central Battlefield
 * 
 * Distinctive board representation: Sculpted oval frame, Attack/Stamina medallions,
 * Front Desk Guard taunt shield, active ready aura, and Option A buffer shield.
 */

import React, { useState } from 'react';
import { 
  Swords, 
  Shield, 
  Lock, 
  Info, 
  Award,
  Sparkles,
  Zap,
  Moon
} from 'lucide-react';
import { GameViewCard, CardRarity } from '../types';
import { getIconComponent, getDepartmentColor, CardView } from './CardView';

interface BoardMinionTileProps {
  card: GameViewCard;
  isPlayerMinion?: boolean;
  isSelected?: boolean;
  canAttack?: boolean;
  isTargetable?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  onDragStartAttack?: (e: React.MouseEvent | React.TouchEvent) => void;
  animationClass?: string;
}

export const BoardMinionTile: React.FC<BoardMinionTileProps> = ({
  card,
  isPlayerMinion = true,
  isSelected = false,
  canAttack = false,
  isTargetable = false,
  onClick,
  onInspect,
  onDragStartAttack,
  animationClass = ''
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const IconComp = getIconComponent(card.iconName);
  const deptColor = getDepartmentColor(card.department);

  const isSupervisor = card.rarity === 'SUPERVISOR';
  const hasBuffer = (card.staminaBuffer ?? 0) > 0;

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={onClick}
      onMouseDown={canAttack ? onDragStartAttack : undefined}
      onTouchStart={canAttack ? onDragStartAttack : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onInspect) onInspect();
      }}
      className={`relative select-none w-24 sm:w-28 md:w-32 h-32 sm:h-38 md:h-42 flex flex-col items-center justify-center cursor-pointer transition-transform duration-200 group
        ${animationClass}
        ${isSelected ? 'scale-110 z-30' : 'hover:scale-105'}
      `}
    >
      {/* Front Desk Guard Heavy Wooden/Metal Taunt Shield Rim */}
      {card.isGuard && (
        <div className="absolute -inset-2.5 rounded-3xl border-3 border-amber-600/90 bg-gradient-to-b from-amber-900/40 via-stone-900/50 to-amber-950/70 guard-shield-glow -z-10 shadow-2xl">
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-2 py-0.2 rounded-full bg-blue-900 border border-blue-400 text-blue-200 text-[8px] font-black uppercase tracking-wider flex items-center gap-0.5 shadow">
            <Shield className="w-2.5 h-2.5 fill-blue-400" />
            GUARD
          </div>
        </div>
      )}

      {/* Oval Minion Frame */}
      <div className={`relative w-full h-[88%] rounded-[2rem] border-3 overflow-hidden shadow-2xl flex flex-col justify-between transition-all
        ${isSupervisor 
          ? 'border-amber-400 bg-gradient-to-b from-amber-950/80 via-slate-900 to-slate-950' 
          : 'border-slate-500/90 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950'
        }
        ${canAttack && !isSelected ? 'minion-ready-glow border-emerald-400 ring-2 ring-emerald-400/80' : ''}
        ${isSelected ? 'ring-3 ring-amber-400 shadow-[0_0_25px_rgba(245,158,11,0.8)] border-amber-300' : ''}
        ${isTargetable ? 'ring-3 ring-red-500 shadow-[0_0_25px_rgba(239,68,68,0.8)] animate-pulse' : ''}
        ${card.isExhausted ? 'opacity-70 saturate-60' : ''}
      `}>
        {/* Minion Artwork Portrait */}
        <div className={`relative w-full h-[62%] bg-gradient-to-br ${card.avatarGradient} flex items-center justify-center overflow-hidden border-b-2 border-slate-700/80`}>
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:6px_6px]" />
          <IconComp className="w-10 sm:w-12 h-10 sm:h-12 text-white drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] transform group-hover:scale-115 transition-transform duration-300" />
          
          {/* Option A Stamina Buffer Ring Halo */}
          {hasBuffer && (
            <div className="absolute inset-0 border-2 border-cyan-400/80 animate-pulse pointer-events-none rounded-[1.8rem]" />
          )}

          {/* Resting Sleep Badge */}
          {card.isExhausted && (
            <div className="absolute top-1 right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-950/90 border border-slate-700 text-amber-300 text-[8px] font-black">
              <Moon className="w-2.5 h-2.5 text-amber-400" />
              <span>ZZZ</span>
            </div>
          )}
        </div>

        {/* Minion Name Ribbon */}
        <div className="px-1.5 py-0.5 bg-slate-950/95 text-center border-t border-white/10">
          <div className="font-black text-slate-100 text-[9px] sm:text-[10px] truncate leading-tight tracking-tight" title={card.name}>
            {card.name}
          </div>
          <div className="text-[7px] text-amber-400 font-bold uppercase tracking-wider">
            {card.department}
          </div>
        </div>

        {/* Touch-Friendly (i) Info Button */}
        {onInspect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
            className="absolute top-1 left-1 z-20 w-5 h-5 rounded-full bg-slate-950/80 hover:bg-amber-500 text-slate-300 hover:text-slate-950 border border-white/20 flex items-center justify-center transition-colors shadow-sm"
            title="Inspect full lore and ability"
          >
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* STAT MEDALLIONS (Hearthstone-style bottom corner jewels) */}

      {/* Attack (Efficiency) Medallion — Bottom Left Sword */}
      <div 
        className="absolute -bottom-1 -left-1 z-20 w-7 sm:w-8 h-7 sm:h-8 rounded-full bg-gradient-to-br from-yellow-500 via-amber-600 to-red-700 border-2 border-amber-200 shadow-xl flex items-center justify-center text-white font-black text-xs sm:text-sm font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
        title={`Attack: ${card.efficiency}`}
      >
        <span className="leading-none drop-shadow">{card.efficiency}</span>
      </div>

      {/* Stamina (Health) Medallion — Bottom Right Shield */}
      <div 
        className={`absolute -bottom-1 -right-1 z-20 w-7 sm:w-8 h-7 sm:h-8 rounded-full border-2 shadow-xl flex items-center justify-center text-white font-black text-xs sm:text-sm font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
          hasBuffer 
            ? 'bg-gradient-to-br from-cyan-400 via-blue-600 to-cyan-800 border-cyan-200 ring-2 ring-cyan-400/80 animate-pulse' 
            : 'bg-gradient-to-br from-emerald-400 via-green-600 to-teal-800 border-emerald-200'
        }`}
        title={`Stamina: ${card.stamina} / ${card.maxStamina}${hasBuffer ? ` (+${card.staminaBuffer} Buffer)` : ''}`}
      >
        <span className="leading-none drop-shadow">{card.stamina}</span>
      </div>

      {/* Option A Ablative Buffer Tag */}
      {hasBuffer && (
        <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20 px-1.5 py-0.2 rounded-full bg-cyan-950 border border-cyan-400 text-cyan-300 text-[8px] font-black shadow-md flex items-center gap-0.5 whitespace-nowrap">
          <span>+{card.staminaBuffer} BUF</span>
        </div>
      )}

      {/* Target Reticle Overlay */}
      {isTargetable && (
        <div className="absolute inset-0 bg-red-600/25 rounded-[2rem] flex items-center justify-center z-30 pointer-events-none">
          <div className="px-2 py-0.5 bg-red-600 text-white font-black text-[9px] rounded-full shadow-lg border border-red-300 animate-bounce flex items-center gap-0.5">
            <Swords className="w-2.5 h-2.5" />
            TARGET
          </div>
        </div>
      )}

      {/* Tactical Card Tooltip on Hover */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-3 z-50 w-56 p-2.5 rounded-2xl bg-slate-900/98 border border-amber-500/50 shadow-2xl text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-bold text-slate-100 text-xs truncate">{card.name}</span>
            <span className="text-[10px] font-mono text-amber-400 font-bold">{card.shiftCost} SHIFT</span>
          </div>
          {card.abilityName && (
            <div className="mt-1 text-[10.5px] text-amber-300 font-bold">
              {card.abilityName}:
            </div>
          )}
          <div className="text-[10px] text-slate-300 leading-snug mt-0.5">
            {card.abilityDesc || card.flavor}
          </div>
          {card.keywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {card.keywords.map((kw, i) => (
                <span key={i} className="text-[8px] px-1 py-0.2 rounded bg-slate-800 text-amber-200 border border-slate-700 font-medium">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
