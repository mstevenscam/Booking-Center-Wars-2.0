/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Screen 4: Deck Builder
 */

import React, { useState } from 'react';
import { 
  Plus, 
  Minus, 
  Trash2, 
  Save, 
  Search, 
  Filter, 
  Layers, 
  BarChart2, 
  Sparkles, 
  AlertCircle,
  CheckCircle2,
  Info
} from 'lucide-react';
import { GameViewCard, Department, CardType } from '../types';
import { CARD_LIBRARY } from '../mock_controller';
import { CardView, getDepartmentColor } from '../components/CardView';
import { CardInspectorModal } from '../components/CardInspectorModal';

export const DeckBuilderScreen: React.FC = () => {
  // Deck state: Map of templateId -> count
  const [deck, setDeck] = useState<{ [templateId: string]: number }>({
    dave_maestro: 1,
    sarah_cable: 2,
    broadcast_camera: 2,
    marcus_audio: 2,
    bulb_catastrophe: 2,
    gaffer_tape: 2,
    freelance_grip: 2,
    emergency_override: 1,
    asset_tag_drone: 2,
    c_stand_forest: 2
  });

  const [selectedDept, setSelectedDept] = useState<Department | 'ALL'>('ALL');
  const [selectedType, setSelectedType] = useState<CardType | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectedCard, setInspectedCard] = useState<GameViewCard | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Calculate total cards in deck
  const totalDeckCards = Object.values(deck).reduce((sum, count) => sum + count, 0);

  // Add card to deck (max 2 copies, supervisor max 1)
  const addCardToDeck = (card: GameViewCard) => {
    const currentCount = deck[card.templateId] || 0;
    const maxCopies = card.rarity === 'SUPERVISOR' ? 1 : 2;

    if (totalDeckCards >= 30) {
      setSaveStatus('Deck has reached the 30-card tournament limit!');
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }

    if (currentCount >= maxCopies) {
      setSaveStatus(`Maximum ${maxCopies} copies allowed for ${card.name}!`);
      setTimeout(() => setSaveStatus(null), 3000);
      return;
    }

    setDeck({
      ...deck,
      [card.templateId]: currentCount + 1
    });
  };

  // Remove card from deck
  const removeCardFromDeck = (templateId: string) => {
    const currentCount = deck[templateId] || 0;
    if (currentCount <= 1) {
      const updated = { ...deck };
      delete updated[templateId];
      setDeck(updated);
    } else {
      setDeck({
        ...deck,
        [templateId]: currentCount - 1
      });
    }
  };

  // Filter available cards
  const filteredCatalog = CARD_LIBRARY.filter((card) => {
    if (selectedDept !== 'ALL' && card.department !== selectedDept) return false;
    if (selectedType !== 'ALL' && card.cardType !== selectedType) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return (
        card.name.toLowerCase().includes(q) ||
        (card.abilityDesc && card.abilityDesc.toLowerCase().includes(q)) ||
        card.keywords.some(k => k.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate Shift cost curve (1, 2, 3, 4, 5+)
  const costCurve: { [cost: string]: number } = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  Object.entries(deck).forEach(([templateId, count]) => {
    const card = CARD_LIBRARY.find(c => c.templateId === templateId);
    if (!card) return;
    const bucket = card.shiftCost >= 5 ? '5+' : String(card.shiftCost);
    costCurve[bucket] = (costCurve[bucket] || 0) + count;
  });

  const maxCurveValue = Math.max(1, ...Object.values(costCurve));

  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] bg-radial from-slate-900 via-slate-950 to-[#070a0f] p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
      
      {/* Toast Save Alert */}
      {saveStatus && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-amber-500 text-slate-950 font-black text-xs rounded-full shadow-2xl border border-amber-300 animate-in fade-in duration-150">
          {saveStatus}
        </div>
      )}

      {/* LEFT PANE: Card Catalog Browser */}
      <div className="flex-1 flex flex-col bg-slate-950/80 border border-slate-800 rounded-2xl p-4 overflow-hidden">
        {/* Search & Filters */}
        <div className="space-y-3 pb-4 border-b border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                <span>Booking Centre Card Catalog</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Click a card to add it to your operational roster. Right-click to inspect.
              </p>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, ability, keyword..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-amber-400"
              />
            </div>
          </div>

          {/* Department Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            {(['ALL', 'TECH', 'ADMIN', 'FACILITIES', 'BOOKING', 'CHAOS'] as const).map((dept) => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-3 py-1 rounded-lg font-bold text-xs transition-colors shrink-0 ${
                  selectedDept === dept
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                }`}
              >
                {dept}
              </button>
            ))}
          </div>
        </div>

        {/* Card Grid */}
        <div className="flex-1 overflow-y-auto mt-4 pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredCatalog.map((card) => {
              const countInDeck = deck[card.templateId] || 0;
              const maxCopies = card.rarity === 'SUPERVISOR' ? 1 : 2;
              const isMaxed = countInDeck >= maxCopies;

              return (
                <div key={card.id} className="relative group flex flex-col items-center">
                  <CardView
                    card={card}
                    size="compact"
                    onClick={() => addCardToDeck(card)}
                    onInspect={() => setInspectedCard(card)}
                  />

                  {/* Quantity In Deck Tag */}
                  {countInDeck > 0 && (
                    <div className="absolute top-1 right-1 z-30 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-black text-[10px] shadow border border-amber-300">
                      {countInDeck} / {maxCopies}
                    </div>
                  )}

                  {isMaxed && (
                    <div className="absolute inset-0 bg-slate-950/60 rounded-xl pointer-events-none flex items-center justify-center">
                      <span className="text-[10px] font-black text-amber-300 bg-slate-900/90 px-2 py-0.5 rounded border border-amber-500/40">
                        MAX COPIES
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT PANE: Current Deck Roster & Curve Analytics */}
      <div className="w-full lg:w-96 bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
        <div>
          {/* Deck Header */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-black text-sm text-slate-100 uppercase tracking-wider">
                Shift Roster
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-xs font-bold ${totalDeckCards === 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {totalDeckCards} / 30 Cards
                </span>
                {totalDeckCards === 30 ? (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Valid Roster
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                    Needs {30 - totalDeckCards} More
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() => setDeck({})}
              className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
              title="Clear all cards from roster"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Shift Cost Curve Histogram */}
          <div className="my-4 p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1">
                <BarChart2 className="w-3 h-3 text-amber-400" /> Shift Cost Curve
              </span>
              <span>Avg: 2.8</span>
            </div>
            <div className="flex items-end justify-between gap-2 h-16 pt-2">
              {Object.entries(costCurve).map(([cost, count]) => {
                const heightPercent = Math.max(10, (count / maxCurveValue) * 100);
                return (
                  <div key={cost} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-bold text-slate-300">{count}</span>
                    <div className="w-full bg-slate-800 rounded-t overflow-hidden h-10 flex items-end">
                      <div
                        className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t transition-all duration-300"
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">{cost}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Deck Card List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {Object.keys(deck).length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500 italic">
                Your deck is empty. Add cards from the catalog on the left!
              </div>
            ) : (
              Object.entries(deck).map(([templateId, count]) => {
                const card = CARD_LIBRARY.find(c => c.templateId === templateId);
                if (!card) return null;
                const deptColor = getDepartmentColor(card.department);

                return (
                  <div
                    key={templateId}
                    className="flex items-center justify-between p-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div 
                      className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
                      onClick={() => setInspectedCard(card)}
                      title="Inspect card"
                    >
                      <div className="w-5 h-5 rounded-md bg-amber-500 text-slate-950 font-black text-[10px] flex items-center justify-center shrink-0">
                        {card.shiftCost}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-200 truncate">{card.name}</div>
                        <span className={`text-[8px] uppercase font-semibold px-1 rounded border ${deptColor}`}>
                          {card.department}
                        </span>
                      </div>
                    </div>

                    {/* Quantity Adjustment Buttons */}
                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                      <button
                        onClick={() => removeCardFromDeck(templateId)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-black text-amber-300 w-4 text-center">
                        {count}
                      </span>
                      <button
                        onClick={() => addCardToDeck(card)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Save & Validation Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800">
          <button
            onClick={() => {
              setSaveStatus('Roster saved successfully to local operational profile!');
              setTimeout(() => setSaveStatus(null), 3000);
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <Save className="w-4 h-4" />
            <span>SAVE ROSTER CONFIGURATION</span>
          </button>
        </div>
      </div>

      {/* Card Inspector Modal */}
      <CardInspectorModal
        card={inspectedCard}
        onClose={() => setInspectedCard(null)}
      />
    </div>
  );
};
