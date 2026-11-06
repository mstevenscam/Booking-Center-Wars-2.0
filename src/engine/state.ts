/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2A: Canonical Core Game State Model & Zone System
 * 
 * Strict Architectural Guarantees:
 * 1. Pure TypeScript — Zero React, DOM, or UI dependencies.
 * 2. Fully Serializable — Safe for persistence, undo/redo, network sync, and determinism.
 * 3. Stable Mechanical Identifiers — No localized/thematic strings in internal engine state.
 * 4. Immutable/controlled mutations with zone invariants (hand <= 8, board <= 5, deck = 30, copy limit = 2).
 */

import { QueuedTicket, sortResolvingTickets, calculateQueueCost, TriageDecision } from './booking_queue.js';
import type { AbilityDefinition, AbilityTarget, EffectType, TargetFilter, TriggerCondition, TriggerContext } from './abilities.js';

export type PlayerId = 'p1' | 'p2';

export type GamePhase =
  | 'SHIFT_START'          // Phase 1: Ready board, countdown queue, capacity triage
  | 'SHIFT_BUDGETING'     // Phase 2: Increment max capacity, refill Shift, promote escrow
  | 'ADMINISTRATIVE_DRAW' // Phase 3: Draw 1 card (burnout fatigue if empty, hand cap 8)
  | 'OPERATIONAL_ACTION'  // Phase 4: Main phase (play, queue, use Master Key, attack, end)
  | 'CLOCK_OUT';          // Phase 5: Clear temporary Shift, buff expiration, pass turn

export type MatchStatus = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';

export type ZoneType = 'DECK' | 'HAND' | 'BATTLEFIELD' | 'BOOKING_QUEUE' | 'BREAKROOM';

export type CardType = 'CHARACTER' | 'INCIDENT' | 'EQUIPMENT' | 'POLICY';

export type StartingCompensationConfig =
  | 'CONFIG_D' // Canonical Baseline: P1 4 cards, P2 5 cards + 1 Master Key
  | 'CONFIG_E'; // Experimental Alternative: P1 4 cards, P2 5 cards + 2 Master Keys

export interface CardDefinition {
  id: string;              // Canonical card definition ID (e.g. 'char_sr_coordinator')
  name: string;            // Default mechanical/thematic name
  cardType: CardType;      // Classification
  baseCost: number;        // Shift cost to play immediately (1-10)
  influence: number;       // Tie-breaking authority and priority (1-4)
  efficiency: number;      // Combat damage output (power)
  stamina: number;         // Health / durability
  isFrontDeskGuard?: boolean; // Taunt equivalent
  isRush?: boolean;        // Can attack characters immediately on the turn it enters
  isFirstResponder?: boolean; // Can attack characters or Morale immediately on the turn it enters
  isInfiltration?: boolean; // Bypasses Front Desk Guard
  hasOnDeployAbility?: boolean; // Battlecry equivalent
  abilities?: AbilityDefinition[]; // Predefined validated abilities
}

export interface BaseCardTemplate {
  baseCost: number;
  efficiency: number;
  stamina: number;
  influence: number;
  abilities: AbilityDefinition[];
  isFrontDeskGuard: boolean;
  isRush: boolean;
  isFirstResponder: boolean;
  isInfiltration: boolean;
  hasOnDeployAbility: boolean;
}

export interface CardInstance {
  instanceId: string;      // Unique instance ID across the match (e.g. 'inst_p1_c1_1')
  cardDefId: string;       // Reference to canonical CardDefinition
  ownerId: PlayerId;       // Original owner
  currentZone: ZoneType;   // Active zone
  baseCost: number;        // Immutable base Shift cost
  currentCost: number;     // Effective Shift cost to play from hand
  canQueueDiscount: boolean; // False if rerouted from queue to prevent stacking discounts
  isReroutedFromQueue: boolean; // Flagged when returning via triage Option 2
  // Snapshot of stats for runtime modifications
  influence: number;
  efficiency: number;
  stamina: number;
  maxStamina: number;
  temporaryStaminaBuffer: number;
  temporaryEfficiencyBuffer?: number;
  isSilenced?: boolean;
  hasTriggeredClockOut?: boolean;
  hasOnDeployAbility: boolean;
  isFrontDeskGuard: boolean;
  isRush: boolean;
  isFirstResponder?: boolean;
  isInfiltration?: boolean;
  abilities?: AbilityDefinition[];
  baseTemplate?: BaseCardTemplate;
}

export interface CharacterSlot {
  slotId: string;          // 'slot_0' .. 'slot_4'
  card: CardInstance;      // The deployed character
  canAttack: boolean;      // True if ready, false if exhausted or summoning sick
  enteredTurn: number;     // Turn number when deployed
}

export interface PlayerState {
  id: PlayerId;
  morale: number;              // Current Morale (starts at 30, defeat at <= 0)
  maxMorale: number;           // Standard 30
  baseShiftCapacity: number;   // Progressive capacity: starts at 1, max 10
  currentShift: number;        // Current spendable Shift
  shiftHours?: number;         // Compatibility alias for currentShift
  temporaryShift: number;      // Ephemeral Shift (Master Key, temporary boosts)
  pendingEscrowRefund: number; // Refunds granted in Phase 1 before Phase 2 refill
  masterKeyCount: number;      // Available Master Keys (0-cost consumable: +1 temp Shift)
  fatigueCount: number;        // Burnout fatigue counter (1, 2, 3...)
  deck: CardInstance[];        // Draw pile
  hand: CardInstance[];        // Hand (max 8)
  battlefield: CharacterSlot[]; // Front Counter (max 5)
  breakroom: CardInstance[];   // Graveyard / discard pile
  queue: QueuedTicket[];       // Pending Booking Queue tickets (max 3)
  ticketCounter: number;       // Monotonic ticket ID counter
}

export interface PendingTriageOption {
  type: 'RETIRE_EXISTING' | 'REROUTE_TO_HAND' | 'DISCARD_TO_BREAKROOM';
  description: string;
  isAvailable: boolean;
  unavailableReason: string | null;
}

export interface PendingTriageDecision {
  type: 'CAPACITY_TRIAGE';
  playerId: PlayerId;
  ticketId: string;
  cardDefId: string;
  cardName: string;
  effectiveCost: number;
  baseCost: number;
  influence: number;
  hasOnDeployAbility?: boolean;
  allowedOptions: PendingTriageOption[];
}

export type CombatTarget =
  | { type: 'CHARACTER'; characterInstanceId: string }
  | { type: 'MORALE'; targetPlayerId: PlayerId };

export interface PendingCombatTargetOption {
  target: CombatTarget;
  label: string;
  isGuard: boolean;
}

export interface PendingCombatTargetDecision {
  type: 'COMBAT_TARGET_SELECTION';
  playerId: PlayerId;
  attackerInstanceId: string;
  attackerName: string;
  attackerEfficiency: number;
  allowedTargets: PendingCombatTargetOption[];
}

export interface PendingAbilityTargetOption {
  target: AbilityTarget;
  label: string;
  isFriendly: boolean;
}

export interface PendingAbilityTargetDecision {
  type: 'ABILITY_TARGET_SELECTION';
  playerId: PlayerId;
  sourceInstanceId: string;
  sourceCardName: string;
  abilityId: string;
  effectType: EffectType;
  value: number;
  secondaryValue?: number;
  targetFilter: TargetFilter;
  allowedTargets: PendingAbilityTargetOption[];
  executionContext?: { depth: number; budgetCount: number };
  triggerContext?: TriggerContext;
}

export type PendingDecision =
  | PendingTriageDecision
  | PendingCombatTargetDecision
  | PendingAbilityTargetDecision;

export interface MatchResult {
  winner: PlayerId | 'DRAW';
  loser: PlayerId | 'DRAW';
  winReason: string;
  turnCompleted: number;
}

export interface QueuedTriggerState {
  sourceInstanceId: string;
  sourcePlayerId: PlayerId;
  ability: AbilityDefinition;
  trigger: TriggerCondition;
  departingCard?: CardInstance;
  executionContext?: { depth: number; budgetCount: number };
  triggerContext?: TriggerContext;
}

export type PendingContinuation =
  | {
      type: 'CONTINUE_DEPLOY';
      playerId: PlayerId;
      cardInstanceId: string;
      stage: 'AWAITING_ON_PLAY' | 'AWAITING_ON_DEPLOY';
      executionContext?: { depth: number; budgetCount: number };
    }
  | {
      type: 'CONTINUE_COMBAT';
      playerId: PlayerId;
      attackerInstanceId: string;
      target: CombatTarget;
      stage: 'AWAITING_ON_ATTACK' | 'AWAITING_POST_DAMAGE_TRIGGERS';
      combatDamageApplied?: boolean;
      executionContext?: { depth: number; budgetCount: number };
    }
  | {
      type: 'CONTINUE_CLOCK_OUT';
      playerId: PlayerId;
      stage: 'AWAITING_END_OF_SHIFT';
      executionContext?: { depth: number; budgetCount: number };
    }
  | {
      type: 'CONTINUE_SHIFT_START';
      playerId: PlayerId;
      stage: 'AWAITING_START_OF_SHIFT';
      triageDecisions?: [string, TriageDecision][];
      executionContext?: { depth: number; budgetCount: number };
    }
  | {
      type: 'CONTINUE_QUEUE_RESOLUTION';
      playerId: PlayerId;
      stage: 'RESOLVING_TICKETS';
      countdownDecremented: boolean;
      triageDecisions?: [string, TriageDecision][];
      executionContext?: { depth: number; budgetCount: number };
    };

export interface GameState {
  matchId: string;
  status: MatchStatus;
  config: StartingCompensationConfig;
  currentTurn: number;
  activePlayerId: PlayerId;
  currentPhase: GamePhase;
  players: {
    p1: PlayerState;
    p2: PlayerState;
  };
  pendingDecision: PendingDecision | null;
  pendingTriggerQueue?: QueuedTriggerState[];
  pendingContinuation?: PendingContinuation | null;
  instanceCounter: number;
  rngState?: number;
  result: MatchResult | null;
  historyLog: string[];
}

export interface MatchInitConfig {
  matchId?: string;
  config?: StartingCompensationConfig;
  p1Deck: CardDefinition[];
  p2Deck: CardDefinition[];
  prngSeed?: number;
}

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
  totalCards: number;
  cardCounts: Record<string, number>;
}

/**
 * Validates a 30-card deck according to FINALIZED_GAME_RULES.md Rule 2:
 * 1. Exactly 30 cards.
 * 2. At most 2 copies of any unique card definition ID.
 */
export function validateDeck(deck: CardDefinition[]): DeckValidationResult {
  const errors: string[] = [];
  const cardCounts: Record<string, number> = {};

  for (const card of deck) {
    if (!card || !card.id) {
      errors.push('Deck contains invalid or null card definition.');
      continue;
    }
    cardCounts[card.id] = (cardCounts[card.id] || 0) + 1;
  }

  if (deck.length !== 30) {
    errors.push(`Deck must contain exactly 30 cards (found ${deck.length}).`);
  }

  for (const [cardId, count] of Object.entries(cardCounts)) {
    if (count > 2) {
      errors.push(`Card ${cardId} exceeds 2-copy limit (${count} copies found).`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    totalCards: deck.length,
    cardCounts
  };
}

/**
 * Creates a unique CardInstance from a CardDefinition
 */
let legacyInstanceCounter = 0;
export function instantiateCard(def: CardDefinition, ownerId: PlayerId, zone: ZoneType = 'DECK', instanceNumber?: number): CardInstance {
  // Canonical match creation always supplies an explicit match-local sequence number.
  // The fallback preserves uniqueness for legacy standalone callers and test fixtures;
  // production match state never relies on this process-global compatibility path.
  const stableInstanceNumber = instanceNumber ?? `legacy_${++legacyInstanceCounter}`;
  const hasOnDeploy = !!def.hasOnDeployAbility || !!(def.abilities && def.abilities.some(a => a.trigger === 'ON_DEPLOY' || a.trigger === 'ON_PLAY'));
  const abilities = def.abilities ? [...def.abilities] : [];
  const isFrontDeskGuard = !!def.isFrontDeskGuard;
  const isRush = !!def.isRush;
  const isFirstResponder = !!def.isFirstResponder;
  const isInfiltration = !!def.isInfiltration;

  const baseTemplate: BaseCardTemplate = {
    baseCost: def.baseCost,
    efficiency: def.efficiency,
    stamina: def.stamina,
    influence: def.influence,
    abilities,
    isFrontDeskGuard,
    isRush,
    isFirstResponder,
    isInfiltration,
    hasOnDeployAbility: hasOnDeploy
  };

  return {
    instanceId: `inst_${ownerId}_${def.id}_${stableInstanceNumber}`,
    cardDefId: def.id,
    ownerId,
    currentZone: zone,
    baseCost: def.baseCost,
    currentCost: def.baseCost,
    canQueueDiscount: true,
    isReroutedFromQueue: false,
    influence: def.influence,
    efficiency: def.efficiency,
    stamina: def.stamina,
    maxStamina: def.stamina,
    temporaryStaminaBuffer: 0,
    temporaryEfficiencyBuffer: 0,
    isSilenced: false,
    hasTriggeredClockOut: false,
    hasOnDeployAbility: hasOnDeploy,
    isFrontDeskGuard,
    isRush,
    isFirstResponder,
    isInfiltration,
    abilities,
    baseTemplate
  };
}

/**
 * Initializes a single PlayerState
 */
export function createPlayerState(playerId: PlayerId, deckDefs: CardDefinition[], instanceOffset?: number): PlayerState {
  const deck = deckDefs.map((def, index) =>
    instantiateCard(def, playerId, 'DECK', instanceOffset === undefined ? undefined : instanceOffset + index + 1)
  );
  return {
    id: playerId,
    morale: 30,
    maxMorale: 30,
    baseShiftCapacity: 1,
    currentShift: 1,
    temporaryShift: 0,
    pendingEscrowRefund: 0,
    masterKeyCount: 0,
    fatigueCount: 0,
    deck,
    hand: [],
    battlefield: [],
    breakroom: [],
    queue: [],
    ticketCounter: 0
  };
}

/**
 * Initial Match Setup Factory:
 * 1. Validates 30-card decks for P1 and P2.
 * 2. Creates PlayerState for P1 and P2.
 * 3. Applies starting compensation based on config (Config D or Config E).
 * 4. P1 draws 4 cards; P2 draws 5 cards.
 * 5. Sets turn 1, active player p1, phase SHIFT_START.
 */
export function createInitialGameState(config: MatchInitConfig): GameState {
  const p1Val = validateDeck(config.p1Deck);
  if (!p1Val.valid) {
    throw new Error(`Player 1 deck validation failed: ${p1Val.errors.join('; ')}`);
  }
  const p2Val = validateDeck(config.p2Deck);
  if (!p2Val.valid) {
    throw new Error(`Player 2 deck validation failed: ${p2Val.errors.join('; ')}`);
  }

  const startingConfig: StartingCompensationConfig = config.config || 'CONFIG_D';
  const matchId = config.matchId || `match_${Date.now()}`;

  const p1 = createPlayerState('p1', config.p1Deck, 0);
  const p2 = createPlayerState('p2', config.p2Deck, config.p1Deck.length);

  // Apply Config D vs Config E compensation
  if (startingConfig === 'CONFIG_D') {
    p2.masterKeyCount = 1; // 1 Master Key
  } else if (startingConfig === 'CONFIG_E') {
    p2.masterKeyCount = 2; // 2 Master Keys
  }

  // Opening draw: P1 draws 4 cards, P2 draws 5 cards
  for (let i = 0; i < 4; i++) {
    const card = p1.deck.shift();
    if (card) {
      card.currentZone = 'HAND';
      p1.hand.push(card);
    }
  }

  for (let i = 0; i < 5; i++) {
    const card = p2.deck.shift();
    if (card) {
      card.currentZone = 'HAND';
      p2.hand.push(card);
    }
  }

  return {
    matchId,
    status: 'ACTIVE',
    config: startingConfig,
    currentTurn: 1,
    activePlayerId: 'p1',
    currentPhase: 'SHIFT_START',
    players: {
      p1,
      p2
    },
    pendingDecision: null,
    pendingTriggerQueue: [],
    instanceCounter: 60,
    rngState: config.prngSeed !== undefined ? config.prngSeed : 123456789,
    result: null,
    historyLog: [`Match initialized under ${startingConfig}. Player 1 starts.`]
  };
}

/**
 * Safe Card Movement Between Zones
 * Verifies invariants:
 * - Hand <= 8
 * - Battlefield <= 5
 * - Queue <= 3
 */
export function moveCardZone(
  state: GameState,
  instanceId: string,
  targetZone: ZoneType,
  targetSlotIndex?: number
): { success: boolean; error?: string } {
  // Find card across all players and zones
  let foundCard: CardInstance | null = null;
  let owner: PlayerState | null = null;
  let sourceZone: ZoneType | null = null;

  for (const player of [state.players.p1, state.players.p2]) {
    // Check Deck
    const deckIdx = player.deck.findIndex(c => c.instanceId === instanceId);
    if (deckIdx >= 0) {
      foundCard = player.deck.splice(deckIdx, 1)[0];
      owner = player;
      sourceZone = 'DECK';
      break;
    }
    // Check Hand
    const handIdx = player.hand.findIndex(c => c.instanceId === instanceId);
    if (handIdx >= 0) {
      foundCard = player.hand.splice(handIdx, 1)[0];
      owner = player;
      sourceZone = 'HAND';
      break;
    }
    // Check Battlefield
    const boardIdx = player.battlefield.findIndex(s => s.card.instanceId === instanceId);
    if (boardIdx >= 0) {
      foundCard = player.battlefield.splice(boardIdx, 1)[0].card;
      owner = player;
      sourceZone = 'BATTLEFIELD';
      break;
    }
    // Check Breakroom
    const brkIdx = player.breakroom.findIndex(c => c.instanceId === instanceId);
    if (brkIdx >= 0) {
      foundCard = player.breakroom.splice(brkIdx, 1)[0];
      owner = player;
      sourceZone = 'BREAKROOM';
      break;
    }
  }

  if (!foundCard || !owner || !sourceZone) {
    return { success: false, error: `Card instance ${instanceId} not found in any player zone.` };
  }

  // Validate target zone constraints
  if (targetZone === 'HAND') {
    if (owner.hand.length >= 8) {
      // Return card to original zone and fail
      restoreToSourceZone(owner, foundCard, sourceZone);
      return { success: false, error: 'Target Hand is at maximum capacity (8 cards).' };
    }
    foundCard.currentZone = 'HAND';
    owner.hand.push(foundCard);
    return { success: true };
  }

  if (targetZone === 'BATTLEFIELD') {
    if (owner.battlefield.length >= 5) {
      restoreToSourceZone(owner, foundCard, sourceZone);
      return { success: false, error: 'Target Battlefield is at maximum capacity (5 characters).' };
    }
    foundCard.currentZone = 'BATTLEFIELD';
    const slotId = `slot_${targetSlotIndex !== undefined ? targetSlotIndex : owner.battlefield.length}`;
    owner.battlefield.push({
      slotId,
      card: foundCard,
      canAttack: false, // Summoning sickness
      enteredTurn: state.currentTurn
    });
    return { success: true };
  }

  if (targetZone === 'BREAKROOM') {
    foundCard.currentZone = 'BREAKROOM';
    owner.breakroom.push(foundCard);
    return { success: true };
  }

  if (targetZone === 'DECK') {
    foundCard.currentZone = 'DECK';
    owner.deck.unshift(foundCard); // Top of deck
    return { success: true };
  }

  restoreToSourceZone(owner, foundCard, sourceZone);
  return { success: false, error: `Unsupported direct zone transfer to ${targetZone}.` };
}

function restoreToSourceZone(player: PlayerState, card: CardInstance, zone: ZoneType) {
  card.currentZone = zone;
  if (zone === 'DECK') player.deck.unshift(card);
  else if (zone === 'HAND') player.hand.push(card);
  else if (zone === 'BREAKROOM') player.breakroom.push(card);
  else if (zone === 'BATTLEFIELD') {
    player.battlefield.push({
      slotId: `slot_${player.battlefield.length}`,
      card,
      canAttack: false,
      enteredTurn: 1
    });
  }
}

/**
 * Deep clones game state for pure functional transitions and test rollbacks
 */
export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Serializes game state to JSON string
 */
export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Deserializes JSON string to typed GameState
 */
export function deserializeGameState(json: string): GameState {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch (err: any) {
    throw new Error(`Malformed JSON: Unable to parse GameState (${err.message}).`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid serialized GameState: Root must be a non-null object.');
  }

  if (!parsed.matchId || !parsed.status || !parsed.players || !parsed.players.p1 || !parsed.players.p2) {
    throw new Error('Invalid serialized GameState structure: Missing required matchId, status, or player objects.');
  }

  if (typeof parsed.players.p1.morale !== 'number' || typeof parsed.players.p2.morale !== 'number') {
    throw new Error('Invalid serialized GameState structure: Corrupted player Morale.');
  }

  return parsed as GameState;
}

/**
 * Asserts whether a game operation is currently unfinished or suspended.
 * An operation is suspended when:
 * 1. A manual player decision is pending (ABILITY_TARGET_SELECTION, COMBAT_TARGET_SELECTION, CAPACITY_TRIAGE).
 * 2. Unexecuted triggers remain in the pendingTriggerQueue (e.g. from budget exhaustion or cascading events).
 * 3. A multi-stage parent continuation is awaiting resumption.
 */
export function isOperationSuspended(state: GameState): boolean {
  if (state.pendingDecision !== null) return true;
  if (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0) return true;
  if (state.pendingContinuation !== null && state.pendingContinuation !== undefined) return true;
  return false;
}
