/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Milestone 3 — Premium Digital Collectible Card Component
 * 
 * Production-grade collectible CCG card architecture:
 * - Dimensional physical card feel with sculpted metallic/parchment bezels.
 * - 4 distinct card type frames: Character, Incident, Equipment, Policy.
 * - 4 distinct rarity gem treatments: Common, Uncommon, Rare, Supervisor.
 * - 3D faceted Shift cost crystal (mana-style gem with specular highlights).
 * - Attack (Efficiency) and Stamina medallions with gold/bronze trim.
 * - Intelligent non-character presentation (no meaningless 0/0 stats).
 * - Original scanned artwork slot with resilient SVG thematic fallback.
 * - Unboxed editorial department identity, bold ability layout, and satirical lore.
 * - Playable green glow, unplayable dimming, tactile hover elevation.
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
  Info,
  Crown,
  AlertTriangle,
  Layers,
  Paperclip,
  CheckCircle2
} from 'lucide-react';
import { GameViewCard, CardRarity, CardType, Department } from '../types';

interface CardViewProps {
  card: GameViewCard;
  size?: 'compact' | 'standard' | 'large' | 'board';
  isSelected?: boolean;
  isInteractable?: boolean;
  canAttack?: boolean;
  isPlayable?: boolean;
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

export const getDepartmentColor = (dept: Department) => {
  switch (dept) {
    case 'TECH': return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
    case 'ADMIN': return 'text-rose-400 border-rose-500/40 bg-rose-500/10';
    case 'FACILITIES': return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
    case 'BOOKING': return 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10';
    case 'CHAOS': return 'text-purple-400 border-purple-500/40 bg-purple-500/10';
    default: return 'text-slate-400 border-slate-500/40 bg-slate-500/10';
  }
};

export const getDepartmentDisplayName = (dept: Department) => {
  switch (dept) {
    case 'TECH': return 'AV Tech';
    case 'ADMIN': return 'Academic Services';
    case 'FACILITIES': return 'Facilities';
    case 'BOOKING': return 'Booking Desk';
    case 'CHAOS': return 'Campus Chaos';
    default: return dept;
  }
};

export const CardView: React.FC<CardViewProps> = ({
  card,
  size = 'standard',
  isSelected = false,
  isInteractable = true,
  canAttack = false,
  isPlayable = false,
  onClick,
  onInspect,
  customOverlay,
  animationClass = ''
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [imageError, setImageError] = useState(false);
  const IconComp = getIconComponent(card.iconName);

  const isSupervisor = card.rarity === 'SUPERVISOR';
  const isCharacter = card.cardType === 'CHARACTER';
  const isIncident = card.cardType === 'INCIDENT';
  const isEquipment = card.cardType === 'EQUIPMENT';
  const isPolicy = card.cardType === 'POLICY';
  const hasBuffer = (card.staminaBuffer ?? 0) > 0;

  // Frame styling based on card type & rarity
  const frameClass = isIncident 
    ? 'card-frame-incident border-red-700/80 shadow-[0_10px_30px_rgba(220,38,38,0.25)]'
    : isEquipment 
      ? 'card-frame-equipment border-sky-600/80 shadow-[0_10px_30px_rgba(2,132,199,0.25)]'
      : isPolicy 
        ? 'card-frame-policy border-amber-600/80 shadow-[0_10px_30px_rgba(217,119,6,0.25)]'
        : isSupervisor
          ? 'card-frame-character border-amber-400 shadow-[0_10px_35px_rgba(245,158,11,0.35)]'
          : card.rarity === 'RARE'
            ? 'card-frame-character border-blue-400/90 shadow-[0_10px_30px_rgba(59,130,246,0.25)]'
            : card.rarity === 'UNCOMMON'
              ? 'card-frame-character border-emerald-500/80 shadow-[0_10px_25px_rgba(16,185,129,0.2)]'
              : 'card-frame-character border-slate-600/90 shadow-[0_10px_25px_rgba(0,0,0,0.7)]';

  // Dimensional sizes
  const dimensions = {
    compact: 'w-28 sm:w-32 h-40 sm:h-46 text-[9.5px]',
    board: 'w-full max-w-[130px] sm:max-w-[155px] h-46 sm:h-58 text-[10px] sm:text-xs',
    standard: 'w-42 sm:w-48 h-60 sm:h-68 text-xs',
    large: 'w-68 sm:w-76 h-96 sm:h-[430px] text-sm'
  }[size];

  // Rarity gem styling
  const gemClass = isSupervisor
    ? 'rarity-gem-supervisor'
    : card.rarity === 'RARE'
      ? 'rarity-gem-rare'
      : card.rarity === 'UNCOMMON'
        ? 'rarity-gem-uncommon'
        : 'rarity-gem-common';

  return (
    <div
      tabIndex={isInteractable ? 0 : -1}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={isInteractable ? onClick : undefined}
      onKeyDown={(e) => {
        if (!isInteractable) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (onClick) onClick();
        } else if (e.key === 'i' || e.key === 'I') {
          e.preventDefault();
          if (onInspect) onInspect();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (onInspect) onInspect();
      }}
      className={`relative select-none rounded-[1.3rem] border-3 transition-all duration-200 card-tactile-depth flex flex-col justify-between group outline-none
        ${dimensions}
        ${frameClass}
        ${card.isGuard ? 'guard-shield-glow ring-2 ring-blue-500/80' : ''}
        ${isSelected ? 'ring-3 ring-amber-400 scale-[1.06] -translate-y-2 card-glow-amber z-40' : ''}
        ${canAttack && !isSelected ? 'ring-2 ring-emerald-400 minion-ready-glow cursor-pointer' : ''}
        ${isPlayable && !isSelected ? 'card-playable-glow ring-2 ring-emerald-400/90' : ''}
        ${isInteractable ? 'hover:-translate-y-1.5 hover:shadow-2xl cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-400' : 'cursor-default'}
        ${card.isExhausted ? 'opacity-70 saturate-60' : 'opacity-100'}
        ${animationClass}
      `}
    >
      {/* 1. 3D SHIFT COST HEX CRYSTAL (Top-Left) */}
      <div 
        className="absolute -top-1.5 -left-1.5 z-30 flex items-center justify-center filter drop-shadow-md"
        title={`Shift Cost: ${card.shiftCost}`}
      >
        <div className="relative w-7 sm:w-8 md:w-9 h-7 sm:h-8 md:h-9 mana-crystal-rim flex items-center justify-center p-0.5">
          <div className="w-full h-full mana-crystal-facet flex items-center justify-center text-white font-black font-mono text-xs sm:text-sm drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            <span className="leading-none tracking-tight">{card.shiftCost}</span>
          </div>
        </div>
      </div>

      {/* 2. TOP RIGHT: TOUCH-FRIENDLY INSPECT (i) BUTTON */}
      {onInspect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onInspect();
          }}
          className="absolute -top-1 -right-1 z-30 w-6 h-6 rounded-full bg-slate-950/90 hover:bg-amber-500 text-slate-300 hover:text-slate-950 border border-white/20 flex items-center justify-center transition-colors shadow-md"
          title={`Inspect ${card.name} lore and specifications`}
          aria-label={`Inspect ${card.name}`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}

      {/* 3. CARD HEADER BAR: Title & Department */}
      <div className="pt-2 sm:pt-2.5 px-2 pb-1 bg-gradient-to-b from-slate-900/95 via-slate-950/90 to-transparent border-b border-white/10 rounded-t-[1.1rem]">
        <div className="flex items-center justify-between pl-6 pr-4">
          <div className="font-black text-slate-100 truncate text-[10px] sm:text-[11.5px] tracking-tight leading-tight" title={card.name}>
            {card.name}
          </div>
        </div>
        <div className="flex items-center justify-between text-[7px] sm:text-[8px] pl-6 pr-1 mt-0.5 text-slate-400 font-bold uppercase tracking-wider">
          <span className={getDepartmentColor(card.department).split(' ')[0]}>
            {getDepartmentDisplayName(card.department)}
          </span>
          <span className="text-slate-400 font-mono">
            {card.cardType}
          </span>
        </div>
      </div>

      {/* 4. ARTWORK PRESENTATION AREA */}
      <div className={`relative w-full ${size === 'compact' ? 'h-[36%]' : size === 'large' ? 'h-[44%]' : 'h-[39%]'} overflow-hidden border-y border-black/60 bg-slate-950`}>
        {/* Support original scanned card artwork if provided */}
        {card.imageUrl && !imageError ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            onError={() => setImageError(true)}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center filter contrast-105"
          />
        ) : (
          /* Graceful thematic illustration fallback */
          <div className={`relative w-full h-full bg-gradient-to-br ${card.avatarGradient} flex items-center justify-center`}>
            {/* Texture overlay */}
            <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:6px_6px]" />
            
            {/* Thematic background badge depending on type */}
            {isIncident && (
              <div className="absolute inset-0 hazard-stripes-top opacity-15" />
            )}

            {/* Central Icon Asset */}
            <IconComp className={`${size === 'compact' ? 'w-8 h-8' : size === 'large' ? 'w-16 h-16' : 'w-10 sm:w-12 h-10 sm:h-12'} text-white drop-shadow-[0_4px_10px_rgba(0,0,0,0.85)] transform group-hover:scale-110 transition-transform duration-300`} />

            {/* Inset vignette shadow */}
            <div className="absolute inset-0 shadow-[inset_0_0_20px_rgba(0,0,0,0.7)] pointer-events-none" />
          </div>
        )}

        {/* Front Desk Guard Ribbon across artwork */}
        {card.isGuard && (
          <div className="absolute bottom-1 right-1.5 flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-blue-900/95 text-blue-200 text-[7.5px] sm:text-[8.5px] font-black border border-blue-400/60 shadow-lg">
            <Shield className="w-2.5 h-2.5 fill-blue-400" />
            <span>GUARD</span>
          </div>
        )}

        {/* Option A Stamina Buffer Ring Halo */}
        {hasBuffer && (
          <div className="absolute bottom-1 left-1.5 flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-cyan-950/95 text-cyan-300 text-[7.5px] sm:text-[8.5px] font-black border border-cyan-400/80 shadow-lg">
            <span>+{card.staminaBuffer} BUF</span>
          </div>
        )}
      </div>

      {/* 5. CENTER RIBBON WITH EMBEDDED RARITY GEM */}
      <div className="relative w-full h-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-y border-white/10 flex items-center justify-center">
        {/* Rarity gem socket */}
        <div className="absolute -top-1.5 z-20 flex items-center justify-center">
          <div className="relative p-0.5 rounded-full bg-slate-950 border border-slate-700 shadow-md">
            <div 
              className={`w-3.5 h-3.5 rounded-full ${gemClass} flex items-center justify-center`}
              title={`Rarity: ${card.rarity}`}
            >
              {isSupervisor && <Crown className="w-2 h-2 text-slate-950 fill-slate-950" />}
            </div>
          </div>
        </div>
      </div>

      {/* 6. ABILITY & FLAVOUR TEXT BOX */}
      <div className="flex-1 px-2 py-1 flex flex-col justify-between bg-gradient-to-b from-slate-950/90 to-slate-950 text-slate-200 overflow-hidden leading-tight">
        <div>
          {/* Ability Title & Rule Text */}
          {card.abilityName && (
            <div className="font-black text-amber-300 text-[8.5px] sm:text-[9.5px] truncate flex items-center gap-1">
              <span>{card.abilityName}:</span>
            </div>
          )}
          <p className={`text-slate-300 text-[8px] sm:text-[9px] ${size === 'compact' ? 'line-clamp-2' : size === 'large' ? 'line-clamp-4' : 'line-clamp-3'} leading-snug mt-0.5`}>
            {card.abilityDesc || card.flavor}
          </p>
        </div>

        {/* Keywords & Flavor */}
        <div className="mt-0.5">
          {card.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-0.5">
              {card.keywords.slice(0, 2).map((kw, i) => (
                <span key={i} className="text-[6.5px] sm:text-[7.5px] px-1 py-0.2 rounded bg-slate-900/90 text-amber-200/90 font-bold border border-slate-700/80">
                  {kw}
                </span>
              ))}
            </div>
          )}
          {size !== 'compact' && card.abilityName && (
            <p className="text-[7px] sm:text-[7.5px] italic text-slate-500 truncate" title={card.flavor}>
              {card.flavor}
            </p>
          )}
        </div>
      </div>

      {/* 7. CARD FOOTER: CHARACTER STAT MEDALLIONS OR NON-CHARACTER BADGES */}
      {isCharacter ? (
        <div className="relative h-6 sm:h-7 bg-slate-950/95 border-t border-white/10 px-1 flex items-center justify-between rounded-b-[1.1rem]">
          {/* Attack (Efficiency) Medallion — Bottom Left */}
          <div 
            className="absolute -bottom-1 -left-1 z-30 w-7 sm:w-8 h-7 sm:h-8 rounded-full stat-medallion-attack border-2 border-amber-200 shadow-xl flex items-center justify-center text-white font-black text-xs sm:text-sm font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]"
            title={`Efficiency (Combat Attack Power): ${card.efficiency}`}
          >
            <div className="flex items-center leading-none">
              <span className="drop-shadow">{card.efficiency}</span>
            </div>
          </div>

          {/* Influence Medal — Bottom Center */}
          <div 
            className="mx-auto flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-slate-900/90 border border-amber-500/40 text-amber-300 font-bold text-[8px] sm:text-[9px] shadow-sm font-mono"
            title={`Terminal Victory & Queue Influence: ${card.influence}`}
          >
            <Award className="w-2.5 h-2.5 fill-amber-400" />
            <span>{card.influence}</span>
          </div>

          {/* Stamina (Health) Medallion — Bottom Right */}
          <div 
            className={`absolute -bottom-1 -right-1 z-30 w-7 sm:w-8 h-7 sm:h-8 rounded-full border-2 shadow-xl flex items-center justify-center text-white font-black text-xs sm:text-sm font-mono drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)] ${
              hasBuffer ? 'stat-medallion-buffer border-cyan-200' : 'stat-medallion-stamina border-emerald-200'
            }`}
            title={`Stamina (Health): ${card.stamina} / ${card.maxStamina}${hasBuffer ? ` (+${card.staminaBuffer} Buffer)` : ''}`}
          >
            <div className="flex items-center leading-none">
              <span className="drop-shadow">{card.stamina}</span>
            </div>
          </div>
        </div>
      ) : (
        /* NON-CHARACTER CARD FOOTER (No meaningless 0/0 combat stats!) */
        <div className="h-5 sm:h-6 bg-slate-900/90 border-t border-white/10 px-2 flex items-center justify-center text-[7.5px] sm:text-[8.5px] font-black uppercase tracking-wider rounded-b-[1.1rem]">
          {isIncident && (
            <div className="flex items-center gap-1 text-rose-300">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span>DISRUPTIVE INCIDENT</span>
            </div>
          )}
          {isEquipment && (
            <div className="flex items-center gap-1 text-sky-300">
              <Paperclip className="w-3 h-3 text-sky-400" />
              <span>GEAR ATTACHMENT</span>
            </div>
          )}
          {isPolicy && (
            <div className="flex items-center gap-1 text-amber-300">
              <ScrollText className="w-3 h-3 text-amber-400" />
              <span>ADMINISTRATIVE DIRECTIVE</span>
            </div>
          )}
        </div>
      )}

      {/* 8. RESTING / EXHAUSTED OVERLAY */}
      {card.isExhausted && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[1px] flex flex-col items-center justify-center z-30 pointer-events-none rounded-[1.2rem]">
          <div className="px-2.5 py-0.5 bg-slate-900/95 border border-slate-700 rounded-full text-amber-300 font-black text-[8px] sm:text-[9px] tracking-wider flex items-center gap-1 shadow-lg">
            <Lock className="w-2.5 h-2.5 text-amber-400" />
            <span>ON BREAK</span>
          </div>
        </div>
      )}

      {/* Custom Overlay (e.g. selection halo, reticle) */}
      {customOverlay}
    </div>
  );
};
