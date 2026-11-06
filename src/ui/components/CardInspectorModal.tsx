/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Card Inspector Modal
 */

import React, { useEffect } from 'react';
import { X, Shield, Swords, Zap, Award, Info, FileText, CheckCircle2 } from 'lucide-react';
import { GameViewCard } from '../types';
import { CardView, getDepartmentColor } from './CardView';

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

  const deptBadgeClass = getDepartmentColor(card.department);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-3xl bg-slate-900 border-2 border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row">
        {/* Left: Card Display Container */}
        <div className="bg-slate-950/80 p-8 flex items-center justify-center border-b md:border-b-0 md:border-r border-slate-800">
          <div className="transform scale-110">
            <CardView card={card} size="large" isInteractable={false} />
          </div>
        </div>

        {/* Right: Detailed Specification & Lore */}
        <div className="p-6 flex-1 flex flex-col justify-between overflow-y-auto max-h-[85vh]">
          <div>
            {/* Header bar */}
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${deptBadgeClass}`}>
                    {card.department}
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                    {card.rarity} · {card.cardType}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-100 mt-1">{card.name}</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Stat Pill Overview */}
            {card.cardType === 'CHARACTER' && (
              <div className="grid grid-cols-4 gap-2 mt-4">
                <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" /> Shift Cost
                  </span>
                  <span className="text-lg font-black text-amber-400">{card.shiftCost}</span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Swords className="w-3 h-3 text-red-400" /> Power
                  </span>
                  <span className="text-lg font-black text-red-400">{card.efficiency}</span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Shield className="w-3 h-3 text-emerald-400" /> Stamina
                  </span>
                  <span className="text-lg font-black text-emerald-400">
                    {card.stamina} / {card.maxStamina}
                  </span>
                </div>
                <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50 flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                    <Award className="w-3 h-3 text-cyan-400" /> Influence
                  </span>
                  <span className="text-lg font-black text-cyan-400">{card.influence}</span>
                </div>
              </div>
            )}

            {/* Active Ability Explanation */}
            {card.abilityName && (
              <div className="mt-4 p-3.5 bg-amber-950/20 border border-amber-500/30 rounded-xl">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Info className="w-3.5 h-3.5" />
                  <span>ABILITY: {card.abilityName}</span>
                </div>
                <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                  {card.abilityDesc}
                </p>
              </div>
            )}

            {/* Option A Stamina Buffer Details */}
            {(card.staminaBuffer ?? 0) > 0 && (
              <div className="mt-3 p-3 bg-cyan-950/20 border border-cyan-500/30 rounded-xl text-xs">
                <div className="font-bold text-cyan-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>OPTION A TEMPORARY STAMINA BUFFER (+{card.staminaBuffer})</span>
                </div>
                <p className="text-slate-300 mt-0.5 text-[11px]">
                  Absorbs incoming combat and ability damage first without reducing base stamina.
                  Clamps cleanly to card-template maximum upon expiration at End of Shift.
                </p>
              </div>
            )}

            {/* Keywords */}
            {card.keywords.length > 0 && (
              <div className="mt-4">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  Tactical Keywords
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {card.keywords.map((kw, i) => (
                    <div
                      key={i}
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3 text-amber-400" />
                      {kw}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flavor Text Lore */}
            <div className="mt-5 p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider flex items-center gap-1">
                <FileText className="w-3 h-3" /> Booking Centre Archive Lore
              </span>
              <p className="text-xs italic text-slate-400 mt-1 leading-relaxed">
                {card.flavor}
              </p>
            </div>
          </div>

          {/* Modal Footer Controls */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
            <span>Template ID: <code className="text-slate-300 font-mono">{card.templateId}</code></span>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg border border-slate-600 transition-colors"
            >
              Close Inspection
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
