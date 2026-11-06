/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Milestone 3 — High-Fidelity Card Inspector Modal
 * 
 * Production-grade collectible card inspection view:
 * - High-resolution enlarged card presentation on the left.
 * - Comprehensive unclipped specifications, rules text, keywords, and satire lore on the right.
 * - Clear distinction of Card Type rules (Character vs Incident vs Equipment vs Policy).
 * - Option A Stamina Buffer and Front Desk Guard technical breakdowns.
 * - Keyboard (Escape) and click-outside dismissal.
 */

import React, { useEffect } from 'react';
import { 
  X, 
  Shield, 
  Swords, 
  Zap, 
  Award, 
  Info, 
  FileText, 
  CheckCircle2, 
  Crown, 
  AlertTriangle, 
  Paperclip, 
  ScrollText,
  Clock
} from 'lucide-react';
import { GameViewCard } from '../types';
import { CardView, getDepartmentColor, getDepartmentDisplayName } from './CardView';

interface CardInspectorModalProps {
  card: GameViewCard | null;
  onClose: () => void;
}

export const CardInspectorModal: React.FC<CardInspectorModalProps> = ({ card, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!card) return null;

  const isCharacter = card.cardType === 'CHARACTER';
  const isIncident = card.cardType === 'INCIDENT';
  const isEquipment = card.cardType === 'EQUIPMENT';
  const isPolicy = card.cardType === 'POLICY';
  const hasBuffer = (card.staminaBuffer ?? 0) > 0;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-inspector-title"
    >
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-4xl bg-slate-950 border-2 border-slate-700/80 rounded-[2rem] shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Left: Card Display Studio Container */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-10 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-800 shrink-0">
          <div className="transform scale-100 sm:scale-105 hover:scale-110 transition-transform duration-300">
            <CardView card={card} size="large" isInteractable={false} />
          </div>
        </div>

        {/* Right: Detailed Specification & Lore */}
        <div className="p-5 sm:p-8 flex-1 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Header bar */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className={`px-2 py-0.5 rounded border uppercase tracking-wider text-[10px] ${getDepartmentColor(card.department)}`}>
                    {getDepartmentDisplayName(card.department)}
                  </span>
                  <span className="text-slate-400 font-mono text-[11px] uppercase">
                    {card.rarity} · {card.cardType}
                  </span>
                </div>
                <h2 id="card-inspector-title" className="text-2xl sm:text-3xl font-black text-slate-100 mt-1 tracking-tight">
                  {card.name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700 transition-colors"
                title="Close (Esc)"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tactical Stat Overview (Intelligent by Card Type) */}
            {isCharacter ? (
              <div className="grid grid-cols-4 gap-2.5 mt-5">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-cyan-400" /> Shift Cost
                  </span>
                  <span className="text-xl font-black text-cyan-400 font-mono mt-0.5">{card.shiftCost}</span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                    <Swords className="w-3 h-3 text-red-400" /> Efficiency
                  </span>
                  <span className="text-xl font-black text-red-400 font-mono mt-0.5">{card.efficiency}</span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-400" /> Stamina
                  </span>
                  <span className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                    {card.stamina} / {card.maxStamina}
                  </span>
                </div>
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1">
                    <Award className="w-3 h-3 text-amber-400" /> Influence
                  </span>
                  <span className="text-xl font-black text-amber-400 font-mono mt-0.5">{card.influence}</span>
                </div>
              </div>
            ) : (
              /* Non-Character Tactical Overview */
              <div className="grid grid-cols-2 gap-3 mt-5">
                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg mana-crystal-facet flex items-center justify-center text-white font-mono font-black text-lg">
                    {card.shiftCost}
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Shift Cost</div>
                    <div className="text-xs text-cyan-300 font-medium">Authorization Budget</div>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400">
                    {isIncident && <AlertTriangle className="w-5 h-5 text-red-400" />}
                    {isEquipment && <Paperclip className="w-5 h-5 text-sky-400" />}
                    {isPolicy && <ScrollText className="w-5 h-5 text-amber-400" />}
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-bold">Card Classification</div>
                    <div className="text-xs text-slate-200 font-medium">
                      {isIncident ? 'One-Shot Incident Spell' : isEquipment ? 'Permanent Attachment' : 'Administrative Mandate'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Active Ability Explanation */}
            {card.abilityName && (
              <div className="mt-5 p-4 bg-amber-950/20 border border-amber-500/30 rounded-2xl">
                <div className="flex items-center gap-1.5 text-xs font-black text-amber-400 uppercase tracking-wide">
                  <Info className="w-4 h-4" />
                  <span>SPECIAL ABILITY: {card.abilityName}</span>
                </div>
                <p className="text-sm text-slate-200 mt-1.5 leading-relaxed">
                  {card.abilityDesc}
                </p>
              </div>
            )}

            {/* Option A Stamina Buffer Details */}
            {hasBuffer && (
              <div className="mt-3.5 p-3.5 bg-cyan-950/20 border border-cyan-500/30 rounded-2xl text-xs">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5 uppercase tracking-wide text-[11px]">
                  <Shield className="w-3.5 h-3.5" />
                  <span>Option A Stamina Buffer (+{card.staminaBuffer} BUF)</span>
                </div>
                <p className="text-slate-300 mt-1 text-xs leading-relaxed">
                  Ablative temporary stamina that absorbs incoming combat and ability damage first.
                  Expires at End of Shift and cleanly clamps to the card template maximum.
                </p>
              </div>
            )}

            {/* Tactical Keywords */}
            {card.keywords.length > 0 && (
              <div className="mt-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Tactical Keywords
                </span>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {card.keywords.map((kw, i) => (
                    <div
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-amber-200 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>{kw}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flavor Text Lore */}
            <div className="mt-5 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> Booking Centre Archive Lore
              </span>
              <p className="text-xs italic text-slate-300 mt-1.5 leading-relaxed">
                {card.flavor}
              </p>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="mt-6 pt-4 border-t border-slate-800/80 flex justify-between items-center text-xs text-slate-400">
            <span className="font-mono text-[11px]">
              Template: <code className="text-slate-200">{card.templateId}</code>
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl border border-slate-600 transition-colors shadow-md"
            >
              Close Inspection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
