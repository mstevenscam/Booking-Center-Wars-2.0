/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Screen 5: Card Collection
 */

import React, { useState } from 'react';
import { 
  BookOpen, 
  Search, 
  Filter, 
  Sparkles, 
  Award, 
  Layers, 
  Shield, 
  CheckCircle2, 
  Compass, 
  Database
} from 'lucide-react';
import { GameViewCard, Department, CardRarity, CardType } from '../types';
import { CARD_LIBRARY } from '../mock_controller';
import { CardView } from '../components/CardView';
import { CardInspectorModal } from '../components/CardInspectorModal';

export const CardCollectionScreen: React.FC = () => {
  const [selectedDept, setSelectedDept] = useState<Department | 'ALL'>('ALL');
  const [selectedRarity, setSelectedRarity] = useState<CardRarity | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<CardType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedCard, setInspectedCard] = useState<GameViewCard | null>(null);

  const filteredCards = CARD_LIBRARY.filter((card) => {
    if (selectedDept !== 'ALL' && card.department !== selectedDept) return false;
    if (selectedRarity !== 'ALL' && card.rarity !== selectedRarity) return false;
    if (selectedType !== 'ALL' && card.cardType !== selectedType) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        card.name.toLowerCase().includes(q) ||
        (card.abilityDesc && card.abilityDesc.toLowerCase().includes(q)) ||
        card.flavor.toLowerCase().includes(q) ||
        card.keywords.some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate statistics
  const totalCards = CARD_LIBRARY.length;
  const supervisorCount = CARD_LIBRARY.filter(c => c.rarity === 'SUPERVISOR').length;
  const rareCount = CARD_LIBRARY.filter(c => c.rarity === 'RARE').length;
  const uncommonCount = CARD_LIBRARY.filter(c => c.rarity === 'UNCOMMON').length;
  const commonCount = CARD_LIBRARY.filter(c => c.rarity === 'COMMON').length;

  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] bg-radial from-slate-900 via-slate-950 to-[#070a0f] p-4 sm:p-8">
      {/* Header bar */}
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
                <span>Humber Booking Centre Archive</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase">
                  Series 1
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Browse official cards, inspect tactile foils, and explore humorous lore behind every technician and piece of gear.
              </p>
            </div>
          </div>
        </div>

        {/* Collection Stats Pill */}
        <div className="flex items-center gap-3 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 shadow-md">
          <div className="text-center px-2 border-r border-slate-800">
            <div className="text-[10px] uppercase font-bold text-slate-500">Total Cards</div>
            <div className="text-base font-black text-slate-200">{totalCards} / {totalCards}</div>
          </div>
          <div className="text-center px-2 border-r border-slate-800">
            <div className="text-[10px] uppercase font-bold text-amber-400">Supervisors</div>
            <div className="text-base font-black text-amber-400">{supervisorCount}</div>
          </div>
          <div className="text-center px-2 border-r border-slate-800">
            <div className="text-[10px] uppercase font-bold text-purple-400">Rares</div>
            <div className="text-base font-black text-purple-400">{rareCount}</div>
          </div>
          <div className="text-center px-2">
            <div className="text-[10px] uppercase font-bold text-cyan-400">Uncommons</div>
            <div className="text-base font-black text-cyan-400">{uncommonCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="max-w-6xl mx-auto my-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search archive by keyword or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Department */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'TECH', 'ADMIN', 'FACILITIES', 'BOOKING', 'CHAOS'] as const).map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedDept === dept ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>

          {/* Rarity */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
            {(['ALL', 'SUPERVISOR', 'RARE', 'UNCOMMON', 'COMMON'] as const).map((rarity) => (
              <button
                key={rarity}
                onClick={() => setSelectedRarity(rarity)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  selectedRarity === rarity ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {rarity.slice(0, 4)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Card Binder Showcase Grid */}
      <div className="max-w-6xl mx-auto">
        {filteredCards.length === 0 ? (
          <div className="text-center py-16 bg-slate-950/40 rounded-2xl border border-slate-800">
            <Compass className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-300">No cards match your filter criteria</h3>
            <p className="text-xs text-slate-500 mt-1">Try resetting the department or search term.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filteredCards.map((card) => (
              <div
                key={card.id}
                className="flex flex-col items-center group transition-transform duration-200 hover:scale-105"
              >
                <CardView
                  card={card}
                  size="standard"
                  onClick={() => setInspectedCard(card)}
                  onInspect={() => setInspectedCard(card)}
                />
                <button
                  onClick={() => setInspectedCard(card)}
                  className="mt-2 text-[10px] font-bold text-slate-400 hover:text-amber-300 transition-colors"
                >
                  Inspect Lore & Stats
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card Inspector Modal */}
      <CardInspectorModal
        card={inspectedCard}
        onClose={() => setInspectedCard(null)}
      />
    </div>
  );
};
