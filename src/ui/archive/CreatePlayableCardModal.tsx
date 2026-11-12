/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Create Playable Digital Card Definition Modal
 * 
 * Rules:
 * - One historical card can spawn multiple playable variations.
 * - Changing or deleting playable card definitions NEVER modifies the source scan.
 * - Live real-time CardView preview on the right.
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  Plus, 
  Layers, 
  Swords, 
  Shield, 
  Zap, 
  Award,
  Save,
  Check
} from 'lucide-react';
import { HistoricalCardArchive, PlayableCardDefinition } from './types';
import { CardType, CardRarity, Department, GameViewCard } from '../types';
import { archiveStorage } from './storage';
import { CardView } from '../components/CardView';
import { OFFICIAL_ABILITIES_CATALOG } from '../../engine/abilities';

interface CreatePlayableCardModalProps {
  archiveRecord: HistoricalCardArchive | null;
  isOpen: boolean;
  onClose: () => void;
  onCardCreated: (playableCard: PlayableCardDefinition) => void;
}

export const CreatePlayableCardModal: React.FC<CreatePlayableCardModalProps> = ({
  archiveRecord,
  isOpen,
  onClose,
  onCardCreated
}) => {
  const [displayName, setDisplayName] = useState('');
  const [variationName, setVariationName] = useState('Standard Roster');
  const [cardType, setCardType] = useState<CardType>('CHARACTER');
  const [rarity, setRarity] = useState<CardRarity>('COMMON');
  const [department, setDepartment] = useState<Department>('TECH');
  const [shiftCost, setShiftCost] = useState(3);
  const [efficiency, setEfficiency] = useState(3);
  const [stamina, setStamina] = useState(4);
  const [influence, setInfluence] = useState(1);
  const [keywordsStr, setKeywordsStr] = useState('Staging Order 1');
  const [abilityId, setAbilityId] = useState<string | null>(null);
  const [abilityName, setAbilityName] = useState('');
  const [abilityDesc, setAbilityDesc] = useState('');
  const [flavor, setFlavor] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!archiveRecord) return;

    // Clean name from filename
    const clean = archiveRecord.originalFileName
      .replace(/\.[^/.]+$/, '')
      .replace(/^[0-9_-]+/, '') // strip leading year
      .replace(/[_-]+/g, ' ')
      .trim();

    setDisplayName(clean || 'New Booking Specialist');
    setVariationName('Standard Roster');
    setCardType(archiveRecord.classification === 'PHOTOSHOP_TEMPLATE' ? 'CHARACTER' : 'CHARACTER');
    setRarity('COMMON');
    setDepartment('TECH');
    setShiftCost(3);
    setEfficiency(3);
    setStamina(4);
    setInfluence(1);
    setKeywordsStr('');
    setAbilityId(null);
    setAbilityName('');
    setAbilityDesc('');
    setFlavor(`"Originally scanned from physical card archives (${archiveRecord.originalCreationYear || 'Historical'})."`);

    let activeUrl: string | null = null;
    const loadBinary = async () => {
      const blob = await archiveStorage.getArchiveBinary(archiveRecord.archiveId);
      if (blob && archiveRecord.classification === 'CARD_ARTWORK') {
        activeUrl = URL.createObjectURL(blob);
        setImageUrl(activeUrl);
      } else {
        setImageUrl(undefined);
      }
    };

    loadBinary();

    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [archiveRecord]);

  if (!isOpen || !archiveRecord) return null;

  // Synthesize GameViewCard for real-time live preview
  const previewCard: GameViewCard = {
    id: 'preview-card',
    templateId: 'preview-template',
    name: displayName || 'Untitled Card',
    cardType,
    rarity,
    department,
    shiftCost,
    efficiency,
    stamina,
    maxStamina: stamina,
    influence,
    keywords: keywordsStr.split(',').map(s => s.trim()).filter(Boolean),
    abilityName: abilityName.trim() || undefined,
    abilityDesc: abilityDesc.trim() || undefined,
    flavor: flavor.trim() || 'A historical card preserved in the Humber Booking Centre Archive.',
    avatarGradient: 'from-amber-600 to-amber-900',
    iconName: 'Wrench',
    imageUrl,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const playableCardId = `play-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const newPlayableCard: PlayableCardDefinition = {
      playableCardId,
      archiveId: archiveRecord.archiveId,
      displayName: displayName.trim() || 'Untitled Card',
      variationName: variationName.trim() || 'Standard',
      cardType,
      rarity,
      department,
      shiftCost,
      efficiency: cardType === 'CHARACTER' ? efficiency : 0,
      stamina: cardType === 'CHARACTER' ? stamina : 0,
      maxStamina: cardType === 'CHARACTER' ? stamina : 0,
      influence: cardType === 'CHARACTER' ? influence : 0,
      keywords: keywordsStr.split(',').map(s => s.trim()).filter(Boolean),
      abilityId: abilityId || null,
      abilityName: abilityName.trim() || null,
      abilityDesc: abilityDesc.trim() || null,
      flavor: flavor.trim() || 'A historical card preserved in the Humber Booking Centre Archive.',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await archiveStorage.savePlayableCard(newPlayableCard);
    onCardCreated(newPlayableCard);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative z-10 w-full max-w-4xl bg-slate-900 border-2 border-slate-700/80 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[92vh]">
        {/* Form Container (Left) */}
        <div className="p-6 overflow-y-auto flex-1 max-h-[85vh]">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-[10px] font-black uppercase text-amber-400">
                Spawn Digital Card
              </span>
              <h2 className="text-xl font-black text-slate-100">
                Create Playable Card Definition
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
            {/* Source Reference Note */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
              <span className="font-bold text-amber-300">Source Asset:</span>
              <span className="font-mono truncate">{archiveRecord.originalFileName}</span>
            </div>

            {/* Display Name & Variation Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Card Display Name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Sarah, Cable Wrangler"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-hidden focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Variation Edition
                </label>
                <input
                  type="text"
                  required
                  value={variationName}
                  onChange={(e) => setVariationName(e.target.value)}
                  placeholder="e.g. Standard Roster, Alt-Art Promo"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-hidden focus:border-amber-400"
                />
              </div>
            </div>

            {/* Card Type, Department & Rarity */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Card Type
                </label>
                <select
                  value={cardType}
                  onChange={(e) => setCardType(e.target.value as CardType)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200"
                >
                  <option value="CHARACTER">Character</option>
                  <option value="INCIDENT">Incident (Spell)</option>
                  <option value="EQUIPMENT">Equipment</option>
                  <option value="POLICY">Policy</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Department
                </label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value as Department)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200"
                >
                  <option value="TECH">AV Tech</option>
                  <option value="ADMIN">Academic Services</option>
                  <option value="FACILITIES">Facilities</option>
                  <option value="BOOKING">Booking Desk</option>
                  <option value="CHAOS">Campus Chaos</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Rarity
                </label>
                <select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value as CardRarity)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200"
                >
                  <option value="COMMON">Common</option>
                  <option value="UNCOMMON">Uncommon</option>
                  <option value="RARE">Rare</option>
                  <option value="SUPERVISOR">Supervisor</option>
                </select>
              </div>
            </div>

            {/* Shift Cost, Efficiency, Stamina, Influence */}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Shift Cost
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={shiftCost}
                  onChange={(e) => setShiftCost(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono text-center font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Attack (Power)
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  disabled={cardType !== 'CHARACTER'}
                  value={cardType === 'CHARACTER' ? efficiency : 0}
                  onChange={(e) => setEfficiency(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono text-center font-bold disabled:opacity-40"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Stamina (HP)
                </label>
                <input
                  type="number"
                  min="1"
                  max="15"
                  disabled={cardType !== 'CHARACTER'}
                  value={cardType === 'CHARACTER' ? stamina : 0}
                  onChange={(e) => setStamina(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono text-center font-bold disabled:opacity-40"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Influence
                </label>
                <input
                  type="number"
                  min="0"
                  max="5"
                  disabled={cardType !== 'CHARACTER'}
                  value={cardType === 'CHARACTER' ? influence : 0}
                  onChange={(e) => setInfluence(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 font-mono text-center font-bold disabled:opacity-40"
                />
              </div>
            </div>

            {/* Keywords */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Keywords (comma separated)
              </label>
              <input
                type="text"
                value={keywordsStr}
                onChange={(e) => setKeywordsStr(e.target.value)}
                placeholder="Front Desk Guard, Rapid Solder"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 focus:outline-hidden"
              />
            </div>

            {/* Ability */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase text-amber-400 block">
                  Special Ability (Optional)
                </label>
                <span className="text-[10px] text-slate-500">Official Presets</span>
              </div>

              {/* Official Ability Preset Selector */}
              <div>
                <select
                  value={abilityName && OFFICIAL_ABILITIES_CATALOG.some(a => a.name === abilityName) ? abilityName : ""}
                  onChange={(e) => {
                    const preset = OFFICIAL_ABILITIES_CATALOG.find(a => a.name === e.target.value);
                    if (preset) {
                      setAbilityId(preset.id);
                      setAbilityName(preset.name);
                      setAbilityDesc(preset.description);
                    }
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs mb-1"
                >
                  <option value="">{abilityId ? 'Official Preset Selected' : 'Choose Official Ability Preset...'}</option>
                  <optgroup label="Offensive Abilities">
                    {OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'OFFENSIVE').map(a => (
                      <option key={a.id} value={a.name}>{a.name} — {a.action}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Defensive Abilities">
                    {OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'DEFENSIVE').map(a => (
                      <option key={a.id} value={a.name}>{a.name} — {a.action}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Support Abilities">
                    {OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'SUPPORT').map(a => (
                      <option key={a.id} value={a.name}>{a.name} — {a.action}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Disruption Abilities">
                    {OFFICIAL_ABILITIES_CATALOG.filter(a => a.category === 'DISRUPTION').map(a => (
                      <option key={a.id} value={a.name}>{a.name} — {a.action}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Engine Integration Status Badge */}
              {abilityName.trim() && (
                <div className="flex items-center justify-between px-2 py-1 rounded bg-slate-900 border border-slate-800 text-[10px]">
                  <span className="text-slate-400">Engine Integration:</span>
                  {abilityId ? (
                    <span className="text-emerald-400 font-mono font-bold flex items-center gap-1">
                      <Sparkles className="w-3 h-3" /> Linked to {abilityId}
                    </span>
                  ) : (
                    <span className="text-amber-400 italic">
                      Custom Free-Text (Cosmetic / Archive Only)
                    </span>
                  )}
                </div>
              )}

              <input
                type="text"
                value={abilityName}
                onChange={(e) => {
                  const val = e.target.value;
                  setAbilityName(val);
                  const matchingPreset = OFFICIAL_ABILITIES_CATALOG.find(
                    a => a.name.toLowerCase() === val.trim().toLowerCase()
                  );
                  setAbilityId(matchingPreset ? matchingPreset.id : null);
                }}
                placeholder="Ability Name (e.g. Gaffer Tape Patch)"
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200"
              />
              <textarea
                value={abilityDesc}
                onChange={(e) => setAbilityDesc(e.target.value)}
                placeholder="Ability Description (e.g. Restore 3 Stamina to target friendly character.)"
                className="w-full h-14 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 resize-none text-xs"
              />
            </div>

            {/* Flavor Text */}
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Satirical Lore / Flavor Text
              </label>
              <textarea
                value={flavor}
                onChange={(e) => setFlavor(e.target.value)}
                placeholder="Satirical quote or archive background..."
                className="w-full h-14 px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-200 resize-none text-xs italic"
              />
            </div>

            {/* Action buttons */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black flex items-center gap-1.5 shadow-lg"
              >
                <Save className="w-4 h-4" /> Save Playable Card
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview Pane (Right) */}
        <div className="p-6 bg-slate-950 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col items-center justify-center md:w-80 shrink-0">
          <div className="text-[10px] uppercase font-black text-amber-400 tracking-wider mb-3">
            Real-Time Card Preview
          </div>
          <div className="transform scale-95 sm:scale-100">
            <CardView card={previewCard} size="standard" isInteractable={false} />
          </div>
          <p className="text-[10px] text-slate-500 text-center mt-3 max-w-[200px]">
            This digital playable card variation will link back to the original physical scan.
          </p>
        </div>
      </div>
    </div>
  );
};
