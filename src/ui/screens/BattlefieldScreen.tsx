/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Polish Phase V1.1 — Screen 1: Main Battlefield Refinement
 * 
 * Strict engine isolation: Consumes only visual contract state and mock controller.
 * Implements canonical 5-phase turn loop, touch-friendly interactions,
 * non-premature combat animations, and unclipped tactical HUD previews.
 */

import React, { useState } from 'react';
import { 
  Swords, 
  Shield, 
  ChevronRight, 
  Layers, 
  ScrollText, 
  AlertTriangle, 
  Check, 
  X,
  Play,
  RotateCcw,
  Sparkles,
  Zap,
  Info,
  Clock,
  Compass,
  Award,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { VisualGameState, GameViewCard, BattlefieldSlotView, TurnPhase } from '../types';
import { CardView } from '../components/CardView';
import { CardInspectorModal } from '../components/CardInspectorModal';
import { QueueConveyor } from '../components/QueueConveyor';
import { MoraleOrb } from '../components/MoraleOrb';
import { ShiftResourceMeter } from '../components/ShiftResourceMeter';

interface BattlefieldScreenProps {
  state: VisualGameState;
  onAdvancePhase: () => void;
  onPlayCard: (cardId: string, targetSlot: number) => boolean;
  onExecuteAttack: (attackerSlot: number, targetSlot: number | 'SUPERVISOR') => boolean;
  onExpediteTicket: (ticketId: string) => void;
  onResetDemo: () => void;
}

interface DamagePopup {
  id: string;
  targetKey: string; // 'opp-0', 'opp-1', ..., 'opp-supervisor', 'player-0', etc.
  text: string;
  isBuffer?: boolean;
}

const POSITION_NAMES = [
  'RETURN DROP',
  'TECH BENCH',
  'CENTRE DESK (VIP)',
  'GEAR CAGE',
  'FAST DISPATCH'
];

const CANONICAL_PHASES: { key: TurnPhase; step: number; name: string; subtitle: string }[] = [
  { key: 'SHIFT_START', step: 1, name: 'Shift Start', subtitle: 'Units ready, queue counts down' },
  { key: 'SHIFT_BUDGETING', step: 2, name: 'Budgeting', subtitle: 'Refill shift capacity' },
  { key: 'ADMIN_DRAW', step: 3, name: 'Admin Draw', subtitle: 'Draw shift card' },
  { key: 'OPERATIONAL_ACTION', step: 4, name: 'Operational Action', subtitle: 'Deployments & combat strikes' },
  { key: 'CLOCK_OUT', step: 5, name: 'Clock Out', subtitle: 'Buffers expire, turn advances' },
];

export const BattlefieldScreen: React.FC<BattlefieldScreenProps> = ({
  state,
  onAdvancePhase,
  onPlayCard,
  onExecuteAttack,
  onExpediteTicket,
  onResetDemo
}) => {
  // Local UI state
  const [inspectedCard, setInspectedCard] = useState<GameViewCard | null>(null);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [selectedAttackerSlot, setSelectedAttackerSlot] = useState<number | null>(null);
  const [hoveredCard, setHoveredCard] = useState<GameViewCard | null>(null);
  const [showCombatLog, setShowCombatLog] = useState(false);
  const [showSimDrawer, setShowSimDrawer] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [phaseBannerText, setPhaseBannerText] = useState<string | null>(null);

  // Combat animation state
  const [animatingAttackerSlot, setAnimatingAttackerSlot] = useState<number | null>(null);
  const [impactedSlotKey, setImpactedSlotKey] = useState<string | null>(null);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);

  const selectedHandCard = state.player.hand.find(c => c.id === selectedHandCardId) || null;
  const isActionPhase = state.activePhase === 'OPERATIONAL_ACTION';

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3200);
  };

  const triggerPhaseBanner = (phase: TurnPhase) => {
    const banners: Record<TurnPhase, string> = {
      SHIFT_START: 'PHASE 1: SHIFT START — Unexhaust units & advance queue countdown.',
      SHIFT_BUDGETING: 'PHASE 2: SHIFT BUDGETING — Refill operational Shift capacity.',
      ADMIN_DRAW: 'PHASE 3: ADMIN DRAW — Receive next shift operational card.',
      OPERATIONAL_ACTION: 'PHASE 4: OPERATIONAL ACTION — Deploy units, cast incidents & declare attacks.',
      CLOCK_OUT: 'PHASE 5: CLOCK OUT — Temporary stamina buffers expire; hand off turn.'
    };
    setPhaseBannerText(banners[phase]);
    setTimeout(() => setPhaseBannerText(null), 2500);
  };

  const addDamagePopup = (targetKey: string, text: string, isBuffer = false) => {
    const popupId = `dmg-${Date.now()}-${Math.random()}`;
    setDamagePopups(prev => [...prev, { id: popupId, targetKey, text, isBuffer }]);
    setTimeout(() => {
      setDamagePopups(prev => prev.filter(p => p.id !== popupId));
    }, 1200);
  };

  // Check if opponent has any active guards
  const opponentHasGuards = state.opponent.battlefield.some(
    s => s.character && s.character.isGuard && s.character.stamina > 0
  );

  // Handle clicking a player battlefield slot
  const handlePlayerSlotClick = (slotIndex: number) => {
    const slot = state.player.battlefield.find(s => s.slotIndex === slotIndex);

    // If we have a hand card selected, attempt to play it to this slot
    if (selectedHandCard) {
      if (selectedHandCard.cardType === 'CHARACTER') {
        if (!isActionPhase) {
          showToast('Card deployments are only permitted during the Operational Action phase.');
          return;
        }
        if (!slot?.character) {
          const success = onPlayCard(selectedHandCard.id, slotIndex);
          if (success) {
            setSelectedHandCardId(null);
            showToast(`Assigned ${selectedHandCard.name} to ${POSITION_NAMES[slotIndex]}!`);
          } else {
            showToast('Insufficient Shift points for this deployment!');
          }
          return;
        } else {
          showToast('This checkout position is already staffed!');
          return;
        }
      }
    }

    // Otherwise, select this character as attacker
    if (slot?.character) {
      if (!isActionPhase) {
        showToast('Attacks can only be declared during the Operational Action phase.');
        return;
      }
      if (slot.character.isExhausted) {
        showToast(`${slot.character.name} is on break (exhausted) and cannot attack this turn.`);
        return;
      }
      if (selectedAttackerSlot === slotIndex) {
        setSelectedAttackerSlot(null); // toggle off
      } else {
        setSelectedAttackerSlot(slotIndex);
        showToast(`Engaged ${slot.character.name}. Tap an opposing unit or Supervisor to attack!`);
      }
    }
  };

  // Handle clicking an opponent battlefield slot (attack target)
  const handleOpponentSlotClick = (targetSlotIndex: number) => {
    if (selectedAttackerSlot === null) {
      // Just inspect the card
      const targetCard = state.opponent.battlefield.find(s => s.slotIndex === targetSlotIndex)?.character;
      if (targetCard) setInspectedCard(targetCard);
      return;
    }

    if (!isActionPhase) {
      showToast('Attacks can only be declared during the Operational Action phase.');
      return;
    }

    const targetSlot = state.opponent.battlefield.find(s => s.slotIndex === targetSlotIndex);
    if (!targetSlot?.character) return;

    // Check guard priority
    if (opponentHasGuards && !targetSlot.character.isGuard) {
      showToast('Front Desk Guard active! You must engage the Guard first.');
      return;
    }

    const attackerCard = state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character;
    const defenderCard = targetSlot.character;
    if (!attackerCard) return;

    // IMPORTANT EXECUTION SAFETY:
    // Execute the mock action FIRST. Only if it succeeds do we trigger animations and damage popups.
    const success = onExecuteAttack(selectedAttackerSlot, targetSlotIndex);
    if (!success) {
      showToast('Combat action could not be accepted.');
      return;
    }

    // Action accepted! Trigger visual feedback
    setAnimatingAttackerSlot(selectedAttackerSlot);
    const targetKey = `opp-${targetSlotIndex}`;
    setImpactedSlotKey(targetKey);

    // Calculate damage popups
    const defenderBuffer = defenderCard.staminaBuffer || 0;
    if (defenderBuffer > 0) {
      const absorbed = Math.min(defenderBuffer, attackerCard.efficiency);
      addDamagePopup(targetKey, `-${absorbed} BUF`, true);
      if (attackerCard.efficiency > absorbed) {
        setTimeout(() => {
          addDamagePopup(targetKey, `-${attackerCard.efficiency - absorbed} HP`);
        }, 150);
      }
    } else {
      addDamagePopup(targetKey, `-${attackerCard.efficiency} HP`);
    }

    // Retaliation damage popup on attacker
    if (defenderCard.efficiency > 0) {
      const attackerKey = `player-${selectedAttackerSlot}`;
      setTimeout(() => {
        addDamagePopup(attackerKey, `-${defenderCard.efficiency} HP`);
      }, 200);
    }

    setTimeout(() => {
      setAnimatingAttackerSlot(null);
      setImpactedSlotKey(null);
      setSelectedAttackerSlot(null);
    }, 450);
  };

  // Handle direct attack on opponent supervisor
  const handleDirectAttackSupervisor = () => {
    if (selectedAttackerSlot === null) return;
    if (!isActionPhase) {
      showToast('Direct strikes can only be declared during the Operational Action phase.');
      return;
    }
    if (opponentHasGuards) {
      showToast('Front Desk Guard is blocking direct access to the Supervisor desk!');
      return;
    }

    const attackerCard = state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character;
    if (!attackerCard) return;

    // Execute mock action first
    const success = onExecuteAttack(selectedAttackerSlot, 'SUPERVISOR');
    if (!success) {
      showToast('Direct strike could not be accepted.');
      return;
    }

    // Action accepted: Animate
    setAnimatingAttackerSlot(selectedAttackerSlot);
    setImpactedSlotKey('opp-supervisor');
    addDamagePopup('opp-supervisor', `-${attackerCard.efficiency} MORALE`);

    setTimeout(() => {
      setAnimatingAttackerSlot(null);
      setImpactedSlotKey(null);
      setSelectedAttackerSlot(null);
      showToast('Direct strike registered on Supervisor Morale!');
    }, 450);
  };

  // Play an Incident / Policy spell card directly
  const handleCastSpellCard = (card: GameViewCard) => {
    if (!isActionPhase) {
      showToast('Incidents and Policies can only be authorized during the Operational Action phase.');
      return;
    }
    if (state.player.shiftAvailable < card.shiftCost) {
      showToast('Insufficient Shift points to authorize this action!');
      return;
    }
    onPlayCard(card.id, 0);
    setSelectedHandCardId(null);
    showToast(`Authorized ${card.name}!`);
  };

  const handleAdvanceAndBanner = () => {
    const phases: TurnPhase[] = [
      'SHIFT_START',
      'SHIFT_BUDGETING',
      'ADMIN_DRAW',
      'OPERATIONAL_ACTION',
      'CLOCK_OUT'
    ];
    const nextPhase = phases[(phases.indexOf(state.activePhase) + 1) % phases.length];
    triggerPhaseBanner(nextPhase);
    onAdvancePhase();
  };

  const activeFocusCard = hoveredCard || selectedHandCard || (selectedAttackerSlot !== null ? state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character : null);

  return (
    <div className="relative w-full min-h-[calc(100vh-53px)] counter-wood-grain flex flex-col justify-between overflow-x-hidden">
      
      {/* Toast Feedback Notification Banner */}
      {feedbackMessage && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs rounded-full shadow-2xl border border-amber-300 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Cinematic Phase Transition Banner */}
      {phaseBannerText && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-2.5 bg-slate-950/98 border-2 border-amber-500 text-amber-300 font-black text-xs sm:text-sm rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.5)] flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{phaseBannerText}</span>
        </div>
      )}

      {/* TOP: Opponent Command Console */}
      <div className="w-full bg-slate-950/85 border-b border-slate-800/90 px-3 sm:px-6 py-2 flex items-center justify-between backdrop-blur-xs">
        {/* Opponent Morale & Identity */}
        <div className="relative">
          <MoraleOrb
            player={state.opponent}
            isOpponent={true}
            isActiveTurn={state.activePlayerSide === 'OPPONENT'}
            onDirectAttackTarget={handleDirectAttackSupervisor}
            canBeDirectlyAttacked={selectedAttackerSlot !== null && !opponentHasGuards && isActionPhase}
          />
          {/* Floating Damage Popup on Supervisor */}
          {damagePopups.filter(p => p.targetKey === 'opp-supervisor').map(p => (
            <div
              key={p.id}
              className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-50 px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-black text-xs shadow-xl border border-rose-300 anim-float-damage"
            >
              {p.text}
            </div>
          ))}
        </div>

        {/* Opponent Hand (Face Down Cards) */}
        <div className="flex items-center gap-1.5 overflow-hidden">
          {Array.from({ length: state.opponent.hand.length }).map((_, i) => (
            <div
              key={i}
              className="w-7 sm:w-11 h-11 sm:h-15 rounded-lg bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border border-rose-900/60 shadow-md flex items-center justify-center transform hover:-translate-y-1 transition-transform"
              title="Opponent confidential hand card"
            >
              <div className="text-[8px] font-black text-rose-500/40 rotate-45 select-none font-mono">
                BW
              </div>
            </div>
          ))}
        </div>

        {/* Opponent Resources & Deck */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ShiftResourceMeter
            available={state.opponent.shiftAvailable}
            capacity={state.opponent.shiftCap}
            side="opponent"
          />
          <div className="text-right hidden sm:block">
            <div className="text-[10px] font-mono text-slate-400">
              Deck: <span className="font-bold text-slate-200">{state.opponent.deckCount}</span>
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Discard: {state.opponent.discardCount}
            </div>
          </div>
        </div>
      </div>

      {/* OPPONENT BATTLEFIELD (5 Tactical Positions on the Counter) */}
      <div className="w-full px-2 sm:px-4 py-2 flex justify-center">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-3 max-w-5xl w-full">
          {state.opponent.battlefield.map((slot) => {
            const isAttackerTargetable =
              selectedAttackerSlot !== null &&
              slot.character !== null &&
              isActionPhase &&
              (!opponentHasGuards || slot.character.isGuard);
            const slotKey = `opp-${slot.slotIndex}`;
            const isImpacted = impactedSlotKey === slotKey;

            return (
              <div
                key={slotKey}
                onClick={() => handleOpponentSlotClick(slot.slotIndex)}
                className={`relative min-h-[170px] sm:min-h-[220px] rounded-2xl border-2 transition-all flex flex-col items-center justify-center
                  ${slot.character 
                    ? 'border-transparent' 
                    : 'border-dashed border-slate-800/80 bg-slate-950/40'
                  }
                  ${isAttackerTargetable 
                    ? 'ring-2 ring-red-500 cursor-pointer animate-pulse scale-[1.02] shadow-[0_0_15px_rgba(239,68,68,0.4)]' 
                    : ''
                  }
                  ${isImpacted ? 'anim-impact-flash' : ''}
                `}
                onMouseEnter={() => slot.character && setHoveredCard(slot.character)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* Floating Damage Popup on Unit */}
                {damagePopups.filter(p => p.targetKey === slotKey).map(p => (
                  <div
                    key={p.id}
                    className={`absolute -top-3 z-50 px-2.5 py-0.5 rounded-full font-black text-xs shadow-xl border anim-float-damage ${
                      p.isBuffer 
                        ? 'bg-cyan-600 text-white border-cyan-300' 
                        : 'bg-red-600 text-white border-red-300'
                    }`}
                  >
                    {p.text}
                  </div>
                ))}

                {/* Slot Position Label Watermark */}
                {!slot.character && (
                  <div className="text-center p-2 opacity-40">
                    <span className="text-[9px] font-mono font-bold text-slate-500 block">
                      POS {slot.slotIndex + 1}
                    </span>
                    <span className="text-[7.5px] font-mono text-slate-600 uppercase">
                      {POSITION_NAMES[slot.slotIndex]}
                    </span>
                  </div>
                )}

                {slot.character && (
                  <CardView
                    card={slot.character}
                    size="board"
                    onInspect={() => setInspectedCard(slot.character)}
                    customOverlay={
                      isAttackerTargetable ? (
                        <div className="absolute inset-0 bg-red-600/20 backdrop-blur-[1px] flex items-center justify-center z-30 pointer-events-none rounded-xl">
                          <div className="px-2 py-0.5 bg-red-600 text-white font-black text-[9px] sm:text-[10px] rounded-full shadow-lg flex items-center gap-1 border border-red-300 animate-bounce">
                            <Swords className="w-3 h-3" />
                            TARGET
                          </div>
                        </div>
                      ) : undefined
                    }
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CENTRE CONVEYOR & CANONICAL 5-PHASE OPERATIONAL STRIP */}
      <div className="w-full flex flex-col items-center my-1 z-20">
        {/* Booking Queue Conveyor */}
        <div className="w-full max-w-5xl shadow-xl">
          <QueueConveyor
            queue={state.queue}
            onExpediteTicket={onExpediteTicket}
            onInspectCard={(card) => setInspectedCard(card)}
          />
        </div>

        {/* Phase Tracker & Operational Bar */}
        <div className="w-full max-w-5xl px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 bg-slate-950/80 border-b border-slate-800/80">
          {/* Canonical 5 Phases Pipeline */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 overflow-x-auto max-w-full">
            {CANONICAL_PHASES.map((p) => {
              const isCurrent = state.activePhase === p.key;
              return (
                <div
                  key={p.key}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${
                    isCurrent
                      ? 'bg-amber-500 text-slate-950 shadow-md scale-105 ring-1 ring-amber-300'
                      : 'text-slate-500 hover:text-slate-400'
                  }`}
                  title={p.subtitle}
                >
                  <span className="opacity-70 mr-1">{p.step}.</span>
                  <span>{p.name}</span>
                </div>
              );
            })}
          </div>

          {/* Operational Status / Advance Button */}
          <div className="flex items-center gap-2">
            {isActionPhase && (
              <span className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                <Swords className="w-3 h-3" />
                <span>COMBAT & DEPLOY ACTIONS ACTIVE</span>
              </span>
            )}

            <button
              onClick={() => setShowCombatLog(!showCombatLog)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <ScrollText className="w-3.5 h-3.5 text-amber-400" />
              <span>Log ({state.recentCombatLog.length})</span>
            </button>

            <button
              onClick={handleAdvanceAndBanner}
              className="px-3.5 sm:px-4 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg flex items-center gap-1.5 transition-all transform hover:scale-105 active:scale-95"
            >
              <span>ADVANCE PHASE</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* PLAYER BATTLEFIELD (5 Tactical Positions on the Counter) */}
      <div className="w-full px-2 sm:px-4 py-2 flex justify-center">
        <div className="grid grid-cols-5 gap-1.5 sm:gap-3 max-w-5xl w-full">
          {state.player.battlefield.map((slot) => {
            const isAttackerSelected = selectedAttackerSlot === slot.slotIndex;
            const isDeployTarget = selectedHandCard?.cardType === 'CHARACTER' && !slot.character && isActionPhase;
            const slotKey = `player-${slot.slotIndex}`;
            const isLunging = animatingAttackerSlot === slot.slotIndex;
            const isReadyToAttack = slot.character !== null && !slot.character.isExhausted && isActionPhase;

            return (
              <div
                key={slotKey}
                onClick={() => handlePlayerSlotClick(slot.slotIndex)}
                className={`relative min-h-[170px] sm:min-h-[220px] rounded-2xl border-2 transition-all flex flex-col items-center justify-center cursor-pointer
                  ${slot.character 
                    ? 'border-transparent' 
                    : isDeployTarget
                      ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.3)] animate-pulse'
                      : 'border-dashed border-slate-800/80 bg-slate-950/40 hover:border-slate-700'
                  }
                  ${isAttackerSelected ? 'ring-2 ring-amber-400 scale-[1.03] shadow-[0_0_20px_rgba(245,158,11,0.5)]' : ''}
                `}
                onMouseEnter={() => slot.character && setHoveredCard(slot.character)}
                onMouseLeave={() => setHoveredCard(null)}
              >
                {/* Floating Damage Popup on Friendly Unit */}
                {damagePopups.filter(p => p.targetKey === slotKey).map(p => (
                  <div
                    key={p.id}
                    className="absolute -top-3 z-50 px-2.5 py-0.5 rounded-full bg-red-600 text-white font-black text-xs shadow-xl border border-red-300 anim-float-damage"
                  >
                    {p.text}
                  </div>
                ))}

                {/* Empty Slot Position Label */}
                {!slot.character && (
                  <div className="text-center p-2">
                    <span className="text-[9px] font-mono font-bold text-slate-500 block">
                      POS {slot.slotIndex + 1}
                    </span>
                    <span className="text-[7.5px] font-mono text-slate-600 uppercase block">
                      {POSITION_NAMES[slot.slotIndex]}
                    </span>
                    {isDeployTarget && (
                      <span className="text-[9px] text-amber-300 font-bold mt-1 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 block">
                        ASSIGN HERE
                      </span>
                    )}
                  </div>
                )}

                {slot.character && (
                  <CardView
                    card={slot.character}
                    size="board"
                    isSelected={isAttackerSelected}
                    canAttack={isReadyToAttack}
                    animationClass={isLunging ? 'anim-attack-up' : ''}
                    onInspect={() => setInspectedCard(slot.character)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* DOCKED TACTICAL HUD PREVIEW (Guarantees unclipped details on touch and hover) */}
      {activeFocusCard && (
        <div className="w-full max-w-5xl mx-auto px-4 py-1.5 bg-slate-900/90 border border-amber-500/30 rounded-xl mb-1 flex items-center justify-between text-xs backdrop-blur-md animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <span className="font-black text-amber-300 text-xs sm:text-sm">{activeFocusCard.name}</span>
            <span className="text-[10px] text-slate-400 font-mono">
              Cost: {activeFocusCard.shiftCost} Shift · {activeFocusCard.efficiency} Power · {activeFocusCard.stamina} HP
              {(activeFocusCard.staminaBuffer ?? 0) > 0 && ` (+${activeFocusCard.staminaBuffer} Buffer)`}
            </span>
            {activeFocusCard.abilityName && (
              <span className="text-[10px] text-slate-300 hidden md:inline truncate max-w-md">
                <strong>{activeFocusCard.abilityName}:</strong> {activeFocusCard.abilityDesc}
              </span>
            )}
          </div>
          <button
            onClick={() => setInspectedCard(activeFocusCard)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-slate-700 shrink-0"
          >
            Inspect Lore
          </button>
        </div>
      )}

      {/* BOTTOM: Player Command Tray & Interactive Hand Container */}
      <div className="w-full bg-slate-950/95 border-t border-slate-800/90 px-3 sm:px-6 py-2.5 backdrop-blur-md">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Player Identity & Morale */}
          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto justify-between md:justify-start">
            <MoraleOrb
              player={state.player}
              isOpponent={false}
              isActiveTurn={state.activePlayerSide === 'PLAYER'}
            />
            <ShiftResourceMeter
              available={state.player.shiftAvailable}
              capacity={state.player.shiftCap}
              side="player"
            />
          </div>

          {/* Player Hand Cards (Fanned CCG Tray) */}
          <div className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2.5 overflow-x-auto py-2 px-2 max-w-full">
            {state.player.hand.map((card) => {
              const isSelected = selectedHandCardId === card.id;
              const canAfford = state.player.shiftAvailable >= card.shiftCost;

              return (
                <div
                  key={card.id}
                  className="relative group transition-all duration-200 shrink-0"
                  onMouseEnter={() => setHoveredCard(card)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <CardView
                    card={card}
                    size="compact"
                    isSelected={isSelected}
                    onClick={() => {
                      if (card.cardType === 'CHARACTER') {
                        setSelectedHandCardId(isSelected ? null : card.id);
                        if (!isSelected) {
                          showToast(`Selected ${card.name}. Tap an empty position on the counter to deploy!`);
                        }
                      } else {
                        setSelectedHandCardId(isSelected ? null : card.id);
                      }
                    }}
                    onInspect={() => setInspectedCard(card)}
                  />

                  {/* Cast Spell Button if Incident/Policy */}
                  {isSelected && (card.cardType === 'INCIDENT' || card.cardType === 'POLICY') && (
                    <button
                      onClick={() => handleCastSpellCard(card)}
                      className="absolute -top-8 left-1/2 transform -translate-x-1/2 z-40 px-2.5 py-1 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[10px] shadow-2xl flex items-center gap-1 border border-amber-200 animate-bounce"
                    >
                      <Zap className="w-3 h-3 fill-slate-950" />
                      AUTHORIZE ({card.shiftCost} SHIFT)
                    </button>
                  )}

                  {!canAfford && (
                    <div className="absolute inset-0 bg-slate-950/65 rounded-xl pointer-events-none flex items-center justify-center">
                      <span className="text-[9px] font-bold text-rose-400 bg-slate-950/90 px-1.5 py-0.5 rounded border border-rose-500/40">
                        NEED {card.shiftCost} SHIFT
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Player Library & Simulation Diagnostics Bar Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-center min-w-[50px] hidden sm:block">
              <div className="text-[8px] uppercase font-bold text-slate-400">Deck</div>
              <div className="text-xs sm:text-sm font-black text-slate-200">{state.player.deckCount}</div>
            </div>
            <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-center min-w-[50px] hidden sm:block">
              <div className="text-[8px] uppercase font-bold text-slate-400">Discard</div>
              <div className="text-xs sm:text-sm font-black text-slate-400">{state.player.discardCount}</div>
            </div>

            {/* Clearly Segregated Simulation Diagnostics Toggle */}
            <button
              onClick={() => setShowSimDrawer(!showSimDrawer)}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-700/70 text-[10px] font-bold flex items-center gap-1 transition-colors"
              title="Open Mock Simulation & Diagnostics tools"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Sim Tools</span>
            </button>
          </div>
        </div>
      </div>

      {/* SEGREGATED SIMULATION DIAGNOSTICS DRAWER (Clearly marked as non-competitive developer/tester tools) */}
      {showSimDrawer && (
        <div className="w-full bg-slate-950/98 border-t-2 border-amber-500/40 p-3 flex flex-wrap items-center justify-between gap-3 text-xs z-30">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-500/40">
              SIMULATION / TEST UTILITY
            </span>
            <span className="text-slate-400 text-[11px]">
              These controls simulate engine events in the mock environment and are not player cards.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {state.queue.map((ticket) => (
              ticket.owner === 'PLAYER' && ticket.turnsRemaining > 1 ? (
                <button
                  key={ticket.id}
                  onClick={() => onExpediteTicket(ticket.id)}
                  className="px-2 py-1 rounded bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-slate-700 text-[10px] font-bold transition-colors flex items-center gap-1"
                >
                  <Zap className="w-3 h-3" />
                  <span>Expedite {ticket.ticketNumber} (-1 Turn)</span>
                </button>
              ) : null
            ))}

            <button
              onClick={onResetDemo}
              className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 text-[10px] font-bold border border-slate-700"
            >
              Reset Match State
            </button>
          </div>
        </div>
      )}

      {/* Slide-out Combat Event Log Drawer */}
      {showCombatLog && (
        <div className="fixed bottom-20 right-4 z-50 w-80 max-h-96 bg-slate-900/98 border border-slate-700 rounded-2xl shadow-2xl p-4 flex flex-col backdrop-blur-md">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="font-bold text-xs text-slate-200 flex items-center gap-1.5">
              <ScrollText className="w-3.5 h-3.5 text-amber-400" />
              <span>Shift Combat Log</span>
            </div>
            <button
              onClick={() => setShowCombatLog(false)}
              className="text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto space-y-2">
            {state.recentCombatLog.length === 0 ? (
              <div className="text-xs text-slate-500 italic py-2">No attacks recorded this shift.</div>
            ) : (
              state.recentCombatLog.map((log) => (
                <div key={log.id} className="p-2 rounded bg-slate-950/60 border border-slate-800 text-[11px]">
                  <div className="flex justify-between text-[9px] text-slate-500">
                    <span>Turn {log.turn}</span>
                    <span>{log.timestamp}</span>
                  </div>
                  <div className="mt-1 font-semibold text-slate-200">
                    <span className={log.attackerPlayer === 'PLAYER' ? 'text-amber-400' : 'text-rose-400'}>
                      {log.attackerName}
                    </span>{' '}
                    struck <span className="text-slate-100">{log.targetName}</span> for{' '}
                    <span className="text-red-400 font-bold">{log.damage} DMG</span>
                    {log.counterDamage && (
                      <span className="text-slate-400"> (Retaliation: {log.counterDamage} DMG)</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Card Inspector Modal Overlay */}
      <CardInspectorModal
        card={inspectedCard}
        onClose={() => setInspectedCard(null)}
      />
    </div>
  );
};
