/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Hearthstone-Style Battlefield Gameplay Screen
 * 
 * Commercial-grade digital collectible card game battlefield:
 * - Rich 2-sided playing counter with walnut wood grain & brass trims.
 * - Tactile BoardMinionTiles with attack/stamina medallions & guard shield borders.
 * - Opponent and Player HeroPortraits with large Morale orbs.
 * - Curved, fanned, overlapping HandFan with smooth hover elevation & drag-to-play.
 * - Interactive SVG TargetingArrow with dynamic quadratic bezier curve.
 * - 3D End Turn button with active golden glow and tactile depression.
 * - 10-socket ShiftCrystals tray with faceted mana-style gems.
 * - Fully isolated from the game engine.
 */

import React, { useState, useRef, useEffect } from 'react';
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
  SlidersHorizontal
} from 'lucide-react';
import { VisualGameState, GameViewCard, BattlefieldSlotView, TurnPhase } from '../types';
import { BoardMinionTile } from '../components/BoardMinionTile';
import { HeroPortrait } from '../components/HeroPortrait';
import { HandFan } from '../components/HandFan';
import { EndTurnButton } from '../components/EndTurnButton';
import { ShiftCrystals } from '../components/ShiftCrystals';
import { TargetingArrow } from '../components/TargetingArrow';
import { QueueConveyor } from '../components/QueueConveyor';
import { CardInspectorModal } from '../components/CardInspectorModal';
import { CardView } from '../components/CardView';

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
  targetKey: string;
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

export const BattlefieldScreen: React.FC<BattlefieldScreenProps> = ({
  state,
  onAdvancePhase,
  onPlayCard,
  onExecuteAttack,
  onExpediteTicket,
  onResetDemo
}) => {
  // Selection and hover state
  const [inspectedCard, setInspectedCard] = useState<GameViewCard | null>(null);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | null>(null);
  const [selectedAttackerSlot, setSelectedAttackerSlot] = useState<number | null>(null);
  const [hoveredCard, setHoveredCard] = useState<GameViewCard | null>(null);
  const [dragOverSlotIndex, setDragOverSlotIndex] = useState<number | null>(null);

  // Target arrow state
  const [isAimingAttack, setIsAimingAttack] = useState(false);
  const [arrowStart, setArrowStart] = useState<{ x: number; y: number } | null>(null);
  const [arrowEnd, setArrowEnd] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isOverValidTarget, setIsOverValidTarget] = useState(false);

  // Animation and feedback state
  const [animatingAttackerSlot, setAnimatingAttackerSlot] = useState<number | null>(null);
  const [impactedSlotKey, setImpactedSlotKey] = useState<string | null>(null);
  const [damagePopups, setDamagePopups] = useState<DamagePopup[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [phaseBannerText, setPhaseBannerText] = useState<string | null>(null);
  const [showCombatLog, setShowCombatLog] = useState(false);
  const [showSimDrawer, setShowSimDrawer] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const attackerSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lastAttackTimestampRef = useRef<number>(0);

  const selectedHandCard = state.player.hand.find(c => c.id === selectedHandCardId) || null;
  const isActionPhase = state.activePhase === 'OPERATIONAL_ACTION';

  // Guard status check
  const opponentHasGuards = state.opponent.battlefield.some(
    s => s.character && s.character.isGuard && s.character.stamina > 0
  );

  const showToast = (msg: string) => {
    setFeedbackMessage(msg);
    setTimeout(() => setFeedbackMessage(null), 3000);
  };

  const addDamagePopup = (targetKey: string, text: string, isBuffer = false) => {
    const popupId = `dmg-${Date.now()}-${Math.random()}`;
    setDamagePopups(prev => [...prev, { id: popupId, targetKey, text, isBuffer }]);
    setTimeout(() => {
      setDamagePopups(prev => prev.filter(p => p.id !== popupId));
    }, 1400);
  };

  // Unified Pointer Targeting: Tracking pointer move, up, and cancel across window
  useEffect(() => {
    if (!isAimingAttack) return;

    const handlePointerMove = (e: PointerEvent) => {
      setArrowEnd({ x: e.clientX, y: e.clientY });

      // Detect element under pointer
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const opponentSlotElem = elem?.closest('[data-opponent-slot]');
      const opponentHeroElem = elem?.closest('[data-opponent-hero]');

      if (opponentHeroElem) {
        setIsOverValidTarget(!opponentHasGuards);
      } else if (opponentSlotElem) {
        const slotIdx = Number(opponentSlotElem.getAttribute('data-opponent-slot'));
        const slot = state.opponent.battlefield.find(s => s.slotIndex === slotIdx);
        const valid = Boolean(slot?.character && (!opponentHasGuards || slot.character.isGuard));
        setIsOverValidTarget(valid);
      } else {
        setIsOverValidTarget(false);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      const opponentSlotElem = elem?.closest('[data-opponent-slot]');
      const opponentHeroElem = elem?.closest('[data-opponent-hero]');

      if (opponentHeroElem) {
        handleAttackOpponentHero();
      } else if (opponentSlotElem) {
        const slotIdx = Number(opponentSlotElem.getAttribute('data-opponent-slot'));
        handleAttackOpponentMinion(slotIdx);
      } else {
        // Released over empty board or cancelled
        setIsAimingAttack(false);
        setArrowStart(null);
        setSelectedAttackerSlot(null);
      }
    };

    const handlePointerCancel = () => {
      setIsAimingAttack(false);
      setArrowStart(null);
      setSelectedAttackerSlot(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerCancel);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [isAimingAttack, opponentHasGuards, state.opponent.battlefield, selectedAttackerSlot, isActionPhase]);

  // Initiate attack aiming from player minion (Pointer event)
  const handleStartAttackAim = (slotIndex: number, e: React.PointerEvent) => {
    if (!isActionPhase) {
      showToast('Attacks can only be declared during the Operational Action phase.');
      return;
    }
    const slot = state.player.battlefield.find(s => s.slotIndex === slotIndex);
    if (!slot?.character || slot.character.isExhausted) return;

    setSelectedAttackerSlot(slotIndex);
    setIsAimingAttack(true);
    setArrowStart({ x: e.clientX, y: e.clientY });
    setArrowEnd({ x: e.clientX, y: e.clientY });
  };

  // Resolve attack on opponent minion
  const handleAttackOpponentMinion = (targetSlotIndex: number) => {
    const now = Date.now();
    // Guard against duplicate execution from pointerup followed by synthetic click
    if (now - lastAttackTimestampRef.current < 450) {
      return;
    }

    if (selectedAttackerSlot === null) return;
    if (!isActionPhase) {
      showToast('Attacks can only be declared during the Operational Action phase.');
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    const targetSlot = state.opponent.battlefield.find(s => s.slotIndex === targetSlotIndex);
    if (!targetSlot?.character) {
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    if (opponentHasGuards && !targetSlot.character.isGuard) {
      showToast('Front Desk Guard active! You must engage the Guard first.');
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    const attackerCard = state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character;
    const defenderCard = targetSlot.character;
    if (!attackerCard) {
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    lastAttackTimestampRef.current = now;
    const currentAttackerSlot = selectedAttackerSlot;
    // Execute mock action first
    const success = onExecuteAttack(currentAttackerSlot, targetSlotIndex);
    
    setIsAimingAttack(false);
    setArrowStart(null);

    if (!success) {
      showToast('Action rejected: Attack could not be completed.');
      setSelectedAttackerSlot(null);
      return;
    }

    // Trigger visual feedback only after acceptance (Identified clearly as mock demo feedback)
    setAnimatingAttackerSlot(currentAttackerSlot);
    const targetKey = `opp-${targetSlotIndex}`;
    setImpactedSlotKey(targetKey);

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

    if (defenderCard.efficiency > 0) {
      const attackerKey = `player-${currentAttackerSlot}`;
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

  // Resolve direct attack on opponent hero
  const handleAttackOpponentHero = () => {
    const now = Date.now();
    // Guard against duplicate execution: pointerup followed by synthetic click on HeroPortrait
    if (now - lastAttackTimestampRef.current < 450) {
      return;
    }

    if (selectedAttackerSlot === null) return;
    if (!isActionPhase) {
      showToast('Direct strikes can only be declared during the Operational Action phase.');
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }
    if (opponentHasGuards) {
      showToast('Front Desk Guard is blocking direct access to the Supervisor desk!');
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    const attackerCard = state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character;
    if (!attackerCard) {
      setIsAimingAttack(false);
      setArrowStart(null);
      return;
    }

    lastAttackTimestampRef.current = now;
    const currentAttackerSlot = selectedAttackerSlot;
    const success = onExecuteAttack(currentAttackerSlot, 'SUPERVISOR');
    
    setIsAimingAttack(false);
    setArrowStart(null);

    if (!success) {
      showToast('Action rejected: Direct strike could not be completed.');
      setSelectedAttackerSlot(null);
      return;
    }

    setAnimatingAttackerSlot(currentAttackerSlot);
    setImpactedSlotKey('opp-supervisor');
    addDamagePopup('opp-supervisor', `-${attackerCard.efficiency} MORALE`);

    setTimeout(() => {
      setAnimatingAttackerSlot(null);
      setImpactedSlotKey(null);
      setSelectedAttackerSlot(null);
      showToast('Direct strike registered on Supervisor Morale! (Demo Feedback)');
    }, 450);
  };

  // Drag-and-drop deployment handler
  const handleCardDropOnSlot = (slotIndex: number) => {
    if (!selectedHandCard) return;
    if (!isActionPhase) {
      showToast('Card deployments are only permitted during the Operational Action phase.');
      return;
    }
    const slot = state.player.battlefield.find(s => s.slotIndex === slotIndex);
    if (slot?.character) {
      showToast('This position is already occupied!');
      return;
    }

    const cardToDeploy = selectedHandCard;
    const success = onPlayCard(cardToDeploy.id, slotIndex);
    if (success) {
      showToast(`Deployed ${cardToDeploy.name} to ${POSITION_NAMES[slotIndex]}!`);
      setSelectedHandCardId(null);
      setDragOverSlotIndex(null);
    } else {
      showToast('Action rejected: Insufficient Shift points or position unavailable.');
      // Retain selectedHandCardId so player does not lose their selection
    }
  };

  // Play Spell / Incident / Policy directly
  const handleCastSpellCard = (card: GameViewCard) => {
    if (!isActionPhase) {
      showToast('Spells and Policies can only be authorized during the Operational Action phase.');
      return;
    }
    if (state.player.shiftAvailable < card.shiftCost) {
      showToast('Insufficient Shift points to authorize this action!');
      return;
    }
    const success = onPlayCard(card.id, 0);
    if (success) {
      setSelectedHandCardId(null);
      showToast(`Authorized ${card.name}!`);
    } else {
      showToast('Action rejected: Unable to authorize card.');
    }
  };

  const handleAdvanceAndBanner = () => {
    const banners: Record<TurnPhase, string> = {
      SHIFT_START: 'PHASE 1: SHIFT START — Units ready, queue ticks down.',
      SHIFT_BUDGETING: 'PHASE 2: SHIFT BUDGETING — Shift points refilled.',
      ADMINISTRATIVE_DRAW: 'PHASE 3: ADMIN DRAW — Shift card drawn to hand.',
      OPERATIONAL_ACTION: 'PHASE 4: OPERATIONAL ACTION — Deploy, cast & declare attacks.',
      CLOCK_OUT: 'PHASE 5: CLOCK OUT — Buffs expire; shift ends.'
    };
    const phases: TurnPhase[] = [
      'SHIFT_START',
      'SHIFT_BUDGETING',
      'ADMINISTRATIVE_DRAW',
      'OPERATIONAL_ACTION',
      'CLOCK_OUT'
    ];
    const nextPhase = phases[(phases.indexOf(state.activePhase) + 1) % phases.length];
    setPhaseBannerText(banners[nextPhase]);
    setTimeout(() => setPhaseBannerText(null), 2500);
    onAdvancePhase();
  };

  const activeFocusCard = hoveredCard || selectedHandCard || (selectedAttackerSlot !== null ? state.player.battlefield.find(s => s.slotIndex === selectedAttackerSlot)?.character : null);

  return (
    <div 
      ref={containerRef}
      style={{ touchAction: isAimingAttack ? 'none' : 'auto' }}
      className={`relative w-full min-h-[calc(100vh-53px)] counter-wood-grain flex flex-col justify-between overflow-hidden select-none pb-2 ${isAimingAttack ? 'touch-none' : ''}`}
    >
      {/* Overhead Board Spotlight Effect */}
      <div className="absolute inset-0 board-spotlight pointer-events-none" />

      {/* Targeting Arrow (Rendered dynamically when aiming attack) */}
      {isAimingAttack && arrowStart && (
        <TargetingArrow
          startX={arrowStart.x}
          startY={arrowStart.y}
          endX={arrowEnd.x}
          endY={arrowEnd.y}
          isOverValidTarget={isOverValidTarget}
        />
      )}

      {/* Floating Toast Feedback */}
      {feedbackMessage && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs rounded-full shadow-2xl border border-amber-300 flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-150">
          <Sparkles className="w-3.5 h-3.5" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Phase Transition Banner */}
      {phaseBannerText && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 px-6 py-2 bg-slate-950/98 border-2 border-amber-500 text-amber-300 font-black text-xs sm:text-sm rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.6)] flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{phaseBannerText}</span>
        </div>
      )}

      {/* TOP: OPPONENT AREA */}
      <div className="w-full px-4 sm:px-8 pt-2 flex items-center justify-between z-10">
        {/* Opponent Resources & Deck */}
        <div className="flex items-center gap-2">
          <ShiftCrystals
            available={state.opponent.shiftAvailable}
            capacity={state.opponent.shiftCap}
            isPlayer={false}
          />
          <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center min-w-[48px] hidden sm:block">
            <div className="text-[7.5px] uppercase font-bold text-slate-400">DECK</div>
            <div className="text-xs font-mono font-black text-slate-200">{state.opponent.deckCount}</div>
          </div>
        </div>

        {/* Opponent Hero Portrait (Center Top) */}
        <div 
          data-opponent-hero="true"
          onMouseEnter={() => setIsOverValidTarget(selectedAttackerSlot !== null && !opponentHasGuards)}
          onMouseLeave={() => setIsOverValidTarget(false)}
        >
          <HeroPortrait
            player={state.opponent}
            isOpponent={true}
            isActiveTurn={state.activePlayerSide === 'OPPONENT'}
            canBeDirectlyAttacked={selectedAttackerSlot !== null && !opponentHasGuards && isActionPhase}
            onDirectAttack={handleAttackOpponentHero}
            damagePopupText={damagePopups.find(p => p.targetKey === 'opp-supervisor')?.text}
          />
        </div>

        {/* Opponent Hand (Card Backs Fan) */}
        <div className="flex items-center -space-x-4 sm:-space-x-6 overflow-hidden pr-2">
          {Array.from({ length: state.opponent.hand.length }).map((_, i) => (
            <div
              key={i}
              className="w-10 sm:w-14 h-14 sm:h-20 rounded-xl bg-gradient-to-br from-rose-950 via-slate-900 to-slate-950 border-2 border-rose-900/60 shadow-xl flex items-center justify-center transform hover:-translate-y-2 transition-transform duration-200 cursor-default"
              title="Opponent confidential hand card"
            >
              <div className="w-6 h-6 rounded-full border border-rose-500/30 flex items-center justify-center text-[9px] font-black text-rose-400 font-mono">
                BW
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CENTRAL HEARTHSTONE-STYLE BATTLEGROUND MAT */}
      <div className="relative w-full max-w-5xl mx-auto my-1 px-3 sm:px-6">
        <div className="relative w-full rounded-[2.5rem] board-counter-rim p-3 sm:p-5 flex flex-col justify-between gap-3 shadow-2xl border-4 border-slate-800/80">
          
          {/* OPPONENT MINION ROW */}
          <div className="w-full flex items-center justify-center min-h-[140px] sm:min-h-[175px]">
            <div className="grid grid-cols-5 gap-2 sm:gap-4 w-full max-w-3xl">
              {state.opponent.battlefield.map((slot) => {
                const isTargetable = selectedAttackerSlot !== null && slot.character !== null && isActionPhase && (!opponentHasGuards || slot.character.isGuard);
                const slotKey = `opp-${slot.slotIndex}`;
                const damagePopup = damagePopups.find(p => p.targetKey === slotKey);

                return (
                  <div
                    key={slotKey}
                    data-opponent-slot={slot.slotIndex}
                    onClick={() => handleAttackOpponentMinion(slot.slotIndex)}
                    onMouseEnter={() => {
                      if (slot.character) setHoveredCard(slot.character);
                      if (isTargetable) setIsOverValidTarget(true);
                    }}
                    onMouseLeave={() => {
                      setHoveredCard(null);
                      setIsOverValidTarget(false);
                    }}
                    className={`relative min-h-[140px] sm:min-h-[175px] rounded-3xl border-2 flex flex-col items-center justify-center transition-all ${
                      slot.character 
                        ? 'border-transparent' 
                        : 'border-dashed border-slate-800/60 bg-slate-950/30'
                    } ${impactedSlotKey === slotKey ? 'anim-impact-flash' : ''}`}
                  >
                    {/* Floating Damage Popup (Identified as mock demo feedback) */}
                    {damagePopup && (
                      <div className={`absolute -top-4 z-50 px-2 py-0.5 rounded-full font-black text-[9.5px] shadow-xl border anim-float-damage flex flex-col items-center leading-none ${
                        damagePopup.isBuffer ? 'bg-cyan-600 text-white border-cyan-300' : 'bg-red-600 text-white border-red-300'
                      }`}>
                        <span>{damagePopup.text}</span>
                        <span className="text-[6.5px] uppercase font-mono tracking-wider opacity-90 mt-0.5">EST. (MOCK DEMO)</span>
                      </div>
                    )}

                    {!slot.character && (
                      <span className="text-[8.5px] font-mono font-bold text-slate-700 tracking-wider">
                        {POSITION_NAMES[slot.slotIndex]}
                      </span>
                    )}

                    {slot.character && (
                      <BoardMinionTile
                        card={slot.character}
                        isPlayerMinion={false}
                        isTargetable={isTargetable}
                        onInspect={() => setInspectedCard(slot.character)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* CENTRE BOARD DIVIDER (Brass inlaid division with booking queue & end turn button) */}
          <div className="relative w-full py-1.5 flex items-center justify-between border-y-2 border-slate-800/80 px-2 sm:px-4 bg-slate-950/70 rounded-xl">
            {/* Left: Booking Queue Conveyor Dock */}
            <div className="flex-1 max-w-lg">
              <QueueConveyor
                queue={state.queue}
                onExpediteTicket={onExpediteTicket}
                onInspectCard={(card) => setInspectedCard(card)}
              />
            </div>

            {/* Right: End Turn 3D Button */}
            <div className="shrink-0 ml-3">
              <EndTurnButton
                isPlayerTurn={state.activePlayerSide === 'PLAYER'}
                activePhase={state.activePhase}
                onAdvancePhase={handleAdvanceAndBanner}
              />
            </div>
          </div>

          {/* PLAYER MINION ROW */}
          <div className="w-full flex items-center justify-center min-h-[140px] sm:min-h-[175px]">
            <div className="grid grid-cols-5 gap-2 sm:gap-4 w-full max-w-3xl">
              {state.player.battlefield.map((slot) => {
                const isAttackerSelected = selectedAttackerSlot === slot.slotIndex;
                const slotKey = `player-${slot.slotIndex}`;
                const damagePopup = damagePopups.find(p => p.targetKey === slotKey);
                const isDeployTarget = selectedHandCard?.cardType === 'CHARACTER' && !slot.character && isActionPhase;
                const isHoveredDrop = dragOverSlotIndex === slot.slotIndex;
                const isReadyToAttack = slot.character !== null && !slot.character.isExhausted && isActionPhase;

                return (
                  <div
                    key={slotKey}
                    ref={(el) => { attackerSlotRefs.current[slot.slotIndex] = el; }}
                    onClick={() => {
                      if (selectedHandCard?.cardType === 'CHARACTER') {
                        handleCardDropOnSlot(slot.slotIndex);
                      } else if (slot.character) {
                        if (!isActionPhase) {
                          showToast('Attacks can only be declared during the Operational Action phase.');
                          return;
                        }
                        if (slot.character.isExhausted) {
                          showToast(`${slot.character.name} is resting and cannot attack.`);
                          return;
                        }
                        setSelectedAttackerSlot(isAttackerSelected ? null : slot.slotIndex);
                        if (!isAttackerSelected) {
                          showToast(`Selected ${slot.character.name}. Drag or tap an enemy target!`);
                        }
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverSlotIndex(slot.slotIndex);
                    }}
                    onDragLeave={() => setDragOverSlotIndex(null)}
                    onDrop={() => handleCardDropOnSlot(slot.slotIndex)}
                    onMouseEnter={() => slot.character && setHoveredCard(slot.character)}
                    onMouseLeave={() => setHoveredCard(null)}
                    className={`relative min-h-[140px] sm:min-h-[175px] rounded-3xl border-2 flex flex-col items-center justify-center transition-all cursor-pointer ${
                      slot.character 
                        ? 'border-transparent' 
                        : isDeployTarget || isHoveredDrop
                          ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_20px_rgba(245,158,11,0.4)] animate-pulse'
                          : 'border-dashed border-slate-800/60 bg-slate-950/30 hover:border-slate-700'
                    }`}
                  >
                    {/* Floating Damage Popup on Friendly Unit (Identified as mock demo feedback) */}
                    {damagePopup && (
                      <div className="absolute -top-4 z-50 px-2 py-0.5 rounded-full bg-red-600 text-white font-black text-[9.5px] shadow-xl border border-red-300 anim-float-damage flex flex-col items-center leading-none">
                        <span>{damagePopup.text}</span>
                        <span className="text-[6.5px] uppercase font-mono tracking-wider opacity-90 mt-0.5">EST. (MOCK DEMO)</span>
                      </div>
                    )}

                    {!slot.character && (
                      <div className="text-center p-1">
                        <span className="text-[8.5px] font-mono font-bold text-slate-600 uppercase block">
                          {POSITION_NAMES[slot.slotIndex]}
                        </span>
                        {isDeployTarget && (
                          <span className="text-[9px] text-amber-300 font-black mt-0.5 block">
                            DROP HERE
                          </span>
                        )}
                      </div>
                    )}

                    {slot.character && (
                      <BoardMinionTile
                        card={slot.character}
                        isPlayerMinion={true}
                        isSelected={isAttackerSelected}
                        canAttack={isReadyToAttack}
                        animationClass={animatingAttackerSlot === slot.slotIndex ? 'anim-attack-up' : ''}
                        onPointerDownAttack={(e) => handleStartAttackAim(slot.slotIndex, e)}
                        onInspect={() => setInspectedCard(slot.character)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* DOCKED TACTICAL CARD INFO HUD (Displays unclipped abilities on hover/selection) */}
      {activeFocusCard && (
        <div className="w-full max-w-4xl mx-auto px-4 py-1.5 bg-slate-900/95 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs backdrop-blur-md shadow-2xl z-30 animate-in fade-in duration-150">
          <div className="flex items-center gap-3">
            <span className="font-black text-amber-300 text-xs sm:text-sm">{activeFocusCard.name}</span>
            <span className="text-[10px] text-slate-400 font-mono">
              {activeFocusCard.shiftCost} Shift · {activeFocusCard.efficiency} Attack · {activeFocusCard.stamina} HP
              {(activeFocusCard.staminaBuffer ?? 0) > 0 && ` (+${activeFocusCard.staminaBuffer} Buffer)`}
            </span>
            {activeFocusCard.abilityName && (
              <span className="text-[10.5px] text-slate-200 hidden md:inline truncate max-w-md">
                <strong className="text-amber-300">{activeFocusCard.abilityName}:</strong> {activeFocusCard.abilityDesc}
              </span>
            )}
          </div>
          <button
            onClick={() => setInspectedCard(activeFocusCard)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-slate-700 shrink-0"
          >
            Inspect Lore
          </button>
        </div>
      )}

      {/* BOTTOM: PLAYER HERO & CURVED HAND FAN TRAY */}
      <div className="w-full px-4 sm:px-8 pb-1 flex flex-col md:flex-row items-end justify-between gap-2 z-20">
        {/* Player Hero Portrait (Bottom Left) */}
        <div className="shrink-0 mb-1">
          <HeroPortrait
            player={state.player}
            isOpponent={false}
            isActiveTurn={state.activePlayerSide === 'PLAYER'}
          />
        </div>

        {/* Hearthstone-Style Curved Fanned Hand (Center Bottom) */}
        <div className="flex-1 flex flex-col items-center justify-end max-w-2xl mx-auto w-full">
          {/* Quick Cast / Authorization Banner if Incident, Equipment, or Policy selected */}
          {selectedHandCard && (selectedHandCard.cardType === 'INCIDENT' || selectedHandCard.cardType === 'POLICY' || selectedHandCard.cardType === 'EQUIPMENT') && (
            <div className="mb-2 z-40">
              <button
                onClick={() => handleCastSpellCard(selectedHandCard)}
                className="px-4 py-1.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-2xl flex items-center gap-1.5 border-2 border-amber-200 animate-bounce cursor-pointer"
              >
                <Zap className="w-4 h-4 fill-slate-950" />
                <span>
                  {selectedHandCard.cardType === 'EQUIPMENT' ? 'EQUIP' : 'AUTHORIZE'} {selectedHandCard.name} ({selectedHandCard.shiftCost} SHIFT)
                </span>
              </button>
            </div>
          )}

          <HandFan
            hand={state.player.hand}
            shiftAvailable={state.player.shiftAvailable}
            selectedCardId={selectedHandCardId}
            onSelectCard={(id) => {
              setSelectedHandCardId(selectedHandCardId === id ? null : id);
            }}
            onInspectCard={(card) => setInspectedCard(card)}
            onDragStart={(card, e) => {
              e.dataTransfer.setData('text/plain', card.id);
              setSelectedHandCardId(card.id);
            }}
          />
        </div>

        {/* Player Shift Crystals & Deck Counter (Bottom Right) */}
        <div className="flex flex-col items-end gap-2 shrink-0 mb-1">
          <ShiftCrystals
            available={state.player.shiftAvailable}
            capacity={state.player.shiftCap}
            isPlayer={true}
          />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center min-w-[48px] hidden sm:block">
              <div className="text-[7.5px] uppercase font-bold text-slate-400">DECK</div>
              <div className="text-xs font-mono font-black text-slate-200">{state.player.deckCount}</div>
            </div>
            <div className="p-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center min-w-[48px] hidden sm:block">
              <div className="text-[7.5px] uppercase font-bold text-slate-400">DISCARD</div>
              <div className="text-xs font-mono font-black text-slate-400">{state.player.discardCount}</div>
            </div>

            {/* Sim Tools Drawer Toggle */}
            <button
              onClick={() => setShowSimDrawer(!showSimDrawer)}
              className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border border-slate-700 text-[10px] font-bold flex items-center gap-1 transition-colors"
              title="Toggle Dev Simulation Diagnostics"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SEGREGATED SIMULATION TEST UTILITY DRAWER */}
      {showSimDrawer && (
        <div className="w-full bg-slate-950/98 border-t-2 border-amber-500/40 p-3 flex flex-wrap items-center justify-between gap-3 text-xs z-30">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-wider border border-amber-500/40">
              SIMULATION / TEST UTILITY
            </span>
            <span className="text-slate-400 text-[11px]">
              Dev tools to trigger queue movement and demo match reset.
            </span>
          </div>

          <div className="flex items-center gap-2">
            {state.queue.map((ticket) => (
              ticket.owner === 'PLAYER' && ticket.turnsRemaining > 1 ? (
                <button
                  key={ticket.id}
                  onClick={() => onExpediteTicket(ticket.id)}
                  className="px-2.5 py-1 rounded bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-slate-700 text-[10px] font-bold transition-colors flex items-center gap-1"
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

      {/* Card Inspector Modal Overlay */}
      <CardInspectorModal
        card={inspectedCard}
        onClose={() => setInspectedCard(null)}
      />
    </div>
  );
};
