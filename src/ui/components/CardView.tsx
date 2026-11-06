/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Polish Phase V1.1 — Collectible Card Component
 */

import React, { useState } from 'react';
import { 
  Zap, 
  Shield, 
  Swords, 
  Award, 
  Wrench, 
  Camera, 
  Mic, 
  Flame, 
  ScrollText, 
  Hammer, 
  FileCheck, 
  Clipboard, 
  Glasses, 
  Archive, 
  Cpu, 
  Coffee, 
  Boxes,
  Lock,
  Sparkles,
  Info
} from 'lucide-react';
import { GameViewCard, CardRarity, Department } from '../types';

interface CardViewProps {
  card: GameViewCard;
  size?: 'compact' | 'standard' | 'large' | 'board';
  isSelected?: boolean;
  isInteractable?: boolean;
  canAttack?: boolean;
  onClick?: () => void;
  onInspect?: () => void;
  customOverlay?: React.ReactNode;
  animationClass?: string;
}

export const getIconComponent = (iconName: string) => {
  switch (iconName) {
    case 'Wrench': return Wrench;
    case 'Camera': return Camera;
    case 'Mic': return Mic;
    case 'Flame': return Flame;
    case 'ScrollText': return ScrollText;
    case 'Hammer': return Hammer;
    case 'FileCheck': return FileCheck;
    case 'Clipboard': return Clipboard;
    case 'Glasses': return Glasses;
    case 'Archive': return Archive;
    case 'Cpu': return Cpu;
    case 'Coffee': return Coffee;
    case 'Boxes': return Boxes;
    case 'Shield': return Shield;
    default: return Sparkles;
  }
};

export const getRarityBorder = (rarity: CardRarity) => {
  switch (rarity) {
    case 'SUPERVISOR':
      return 'border-amber-400/90 shadow-[0_0_18px_rgba(245,158,11,0.4)] bg-gradient-to-b from-amber-950/50 via-slate-900 to-slate-950';
    case 'RARE':
      return 'border-purple-400/90 shadow-[0_0_18px_rgba(168,85,247,0.4)] bg-gradient-to-b from-purple-950/50 via-slate-900 to-slate-950';
    case 'UNCOMMON':
      return 'border-cyan-400/90 shadow-[0_0_18px_rgba(6,182,212,0.4)] bg-gradient-to-b from-cyan-950/50 via-slate-900 to-slate-950';
    case 'COMMON':
    default:
      return 'border-slate-600/90 shadow-[0_4px_12px_rgba(0,0,0,0.6)] bg-gradient-to-b from-slate-900/80 via-slate-950 to-slate-950';
  }
};

export const getDepartmentColor = (dept: Department) => {
  switch (dept) {
    case 'TECH': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    case 'ADMIN': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    case 'FACILITIES': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'BOOKING': return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
    case 'CHAOS': return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    default: return 'bg-slate-500/20 text-slate-300 border-slate-500/40';
  }
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  size = 'standard',
  isSelected = false,
  isInteractable = true,
  canAttack = false,
  onClick,
  onInspect,
  customOverlay,
  animationClass = ''
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const IconComp = getIconComponent(card.iconName);
  const rarityBorderClass = getRarityBorder(card.rarity);
  const deptBadgeClass = getDepartmentColor(card.department);

  // Size dimensions
  const dimensions = {
    compact: 'w-28 sm:w-32 h-40 sm:h-44 text-[10px]',
    board: 'w-full max-w-[130px] sm:max-w-[155px] h-44 sm:h-56 text-[10px] sm:text-xs',
    standard: 'w-40 sm:w-44 h-56 sm:h-64 text-xs',
    large: 'w-60 sm:w-68 h-84 sm:h-96 text-sm'
  }[size];

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={isInteractable ? onClick : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onInspect) onInspect();
      }}
      className={`relative select-none rounded-xl border-2 transition-all duration-200 card-tactile-depth flex flex-col justify-between group
        ${dimensions}
        ${rarityBorderClass}
        ${card.isGuard ? 'guard-shield-glow border-blue-400' : ''}
        ${isSelected ? 'ring-2 ring-amber-400 scale-[1.05] -translate-y-2 card-glow-amber z-30' : ''}
        ${canAttack && !isSelected ? 'ring-1 ring-amber-400/80 hover:ring-2 hover:scale-[1.03] cursor-pointer' : ''}
        ${isInteractable ? 'hover:-translate-y-1 hover:shadow-2xl cursor-pointer' : 'cursor-default'}
        ${card.isExhausted ? 'opacity-75 saturate-50' : 'opacity-100'}
        ${animationClass}
      `}
    >
      {/* Shift Cost Hex Crystal Badge (Top-Left) */}
      <div className="absolute top-1 left-1 z-20 flex items-center justify-center w-5 sm:w-6 h-5 sm:h-6 rounded-md sm:rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-amber-200/50">
        <Zap className="w-2.5 sm:w-3 h-2.5 sm:h-3 fill-slate-950" />
        <span className="ml-0.5 leading-none">{card.shiftCost}</span>
      </div>

      {/* Top-Right: Rarity Badge and Touch-Friendly Inspect Button */}
      <div className="absolute top-1 right-1 z-20 flex items-center gap-1">
        <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-950/85 backdrop-blur-xs text-[8px] sm:text-[9px] font-semibold border border-white/10">
          <span className={card.rarity === 'SUPERVISOR' ? 'text-amber-400 font-bold' : 'text-slate-300'}>
            {card.rarity.slice(0, 3)}
          </span>
        </div>

        {/* Touch-Friendly (i) Button */}
        {onInspect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInspect();
            }}
            className="flex items-center justify-center w-6 h-6 rounded bg-slate-900/90 hover:bg-amber-500 text-slate-400 hover:text-slate-950 border border-white/15 transition-colors shadow-xs"
            title="Inspect card details"
            aria-label={`Inspect ${card.name}`}
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Inner visual wrapper to contain artwork and borders without clipping outside tooltips */}
      <div className="w-full h-full flex flex-col justify-between overflow-hidden rounded-xl">
        {/* Card Artwork Box */}
        <div className={`relative w-full ${size === 'board' ? 'h-[36%]' : 'h-[38%]'} bg-gradient-to-br ${card.avatarGradient} flex items-center justify-center overflow-hidden border-b border-white/10`}>
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:8px_8px]" />
          
          {/* Main Icon */}
          <IconComp className={`${size === 'compact' ? 'w-7 h-7' : 'w-9 sm:w-10 h-9 sm:h-10'} text-white/95 drop-shadow-[0_4px_8px_rgba(0,0,0,0.7)] transform group-hover:scale-110 transition-transform duration-300`} />

          {/* Front Desk Guard Ribbon */}
          {card.isGuard && (
            <div className="absolute bottom-1 right-1 flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/90 text-blue-200 rounded text-[8px] sm:text-[9px] font-black border border-blue-400/50 shadow-md">
              <Shield className="w-2.5 h-2.5 fill-blue-400" />
              GUARD
            </div>
          )}

          {/* Option A Stamina Buffer badge */}
          {(card.staminaBuffer ?? 0) > 0 && (
            <div className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-950/95 text-cyan-300 rounded text-[8px] sm:text-[9px] font-black border border-cyan-400/60 shadow-md">
              <span>+{card.staminaBuffer} BUF</span>
            </div>
          )}
        </div>

        {/* Card Title & Department Bar */}
        <div className="px-1.5 sm:px-2 pt-1 pb-0.5 bg-slate-900/95 border-b border-white/5">
          <div className="font-bold text-slate-100 truncate text-[10px] sm:text-[11px] leading-tight" title={card.name}>
            {card.name}
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className={`text-[7px] sm:text-[8px] uppercase tracking-wider font-bold px-1 py-0.2 rounded border ${deptBadgeClass}`}>
              {card.department}
            </span>
            <span className="text-[7px] sm:text-[8px] text-slate-400 uppercase tracking-wider font-semibold">
              {card.cardType}
            </span>
          </div>
        </div>

        {/* Card Text & Abilities */}
        <div className="flex-1 px-1.5 sm:px-2 py-0.5 sm:py-1 flex flex-col justify-between bg-slate-950/70 overflow-hidden text-[9px] sm:text-[9.5px] leading-snug">
          <div>
            {card.abilityName && (
              <div className="font-bold text-amber-300 flex items-center gap-1 text-[9px] sm:text-[10px] truncate">
                <span>{card.abilityName}</span>
              </div>
            )}
            <p className="text-slate-300 line-clamp-2 leading-tight">
              {card.abilityDesc || card.flavor}
            </p>
          </div>

          {/* Keywords */}
          {card.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {card.keywords.slice(0, 2).map((kw, i) => (
                <span key={i} className="text-[7.5px] sm:text-[8px] px-1 bg-slate-800/90 text-amber-200/90 font-medium rounded border border-white/5 truncate max-w-full">
                  {kw}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Card Stats Footer (Efficiency / Influence / Stamina) */}
        {card.cardType === 'CHARACTER' && (
          <div className="h-6 sm:h-7 bg-slate-900/95 border-t border-white/10 px-1.5 sm:px-2 flex items-center justify-between font-black text-[11px] sm:text-xs">
            {/* Efficiency (Attack Power) */}
            <div className="flex items-center gap-0.5 sm:gap-1 text-red-400 font-mono" title="Combat Efficiency (Attack Power)">
              <Swords className="w-3 h-3 fill-red-400" />
              <span>{card.efficiency}</span>
            </div>

            {/* Influence (Terminal Victory Points) */}
            <div className="flex items-center gap-0.5 text-amber-400 text-[9px] sm:text-[10px]" title="Influence">
              <Award className="w-2.5 sm:w-3 h-2.5 sm:h-3" />
              <span>{card.influence}</span>
            </div>

            {/* Stamina (Health) with Buffer Shield indicator */}
            <div className="flex items-center gap-0.5 sm:gap-1 font-mono" title="Stamina (Health)">
              <Shield className={`w-3 h-3 ${ (card.staminaBuffer ?? 0) > 0 ? 'text-cyan-400 fill-cyan-400' : 'text-emerald-400 fill-emerald-400' }`} />
              <span className={ (card.staminaBuffer ?? 0) > 0 ? 'text-cyan-300 font-bold' : 'text-emerald-400' }>
                {card.stamina}
                {(card.staminaBuffer ?? 0) > 0 && (
                  <span className="text-[9px] text-cyan-300 font-normal">+{card.staminaBuffer}</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* Exhausted Resting Overlay */}
        {card.isExhausted && (
          <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[1px] flex flex-col items-center justify-center z-30 pointer-events-none">
            <div className="px-2 py-0.5 bg-slate-900/95 border border-slate-700 rounded-md text-amber-300 font-black text-[9px] tracking-wider flex items-center gap-1 shadow-md">
              <Lock className="w-2.5 h-2.5 text-amber-400" />
              ON BREAK
            </div>
          </div>
        )}
      </div>

      {/* Custom Overlay (e.g. selection halo, target reticle) */}
      {customOverlay}

      {/* Tactical Tooltip: Positioned outside the inner frame so it never gets clipped */}
      {showTooltip && (size === 'board' || size === 'compact') && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 w-52 p-2.5 rounded-xl bg-slate-900/98 border border-amber-500/50 shadow-2xl text-left pointer-events-none animate-in fade-in zoom-in-95 duration-150 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1">
            <span className="font-bold text-slate-100 text-[11px] truncate">{card.name}</span>
            <span className="text-[9px] font-mono text-amber-400">{card.shiftCost} SHIFT</span>
          </div>
          {card.abilityName && (
            <div className="mt-1 text-[10px] text-amber-300 font-bold">
              {card.abilityName}:
            </div>
          )}
          <div className="text-[9.5px] text-slate-300 leading-snug mt-0.5">
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
