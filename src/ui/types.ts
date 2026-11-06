/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Visual Development Phase V1 — Stable UI / Engine Contract
 * 
 * Strict boundary: Defines UI-side game state view models and action dispatch
 * interfaces without touching or importing engine execution internals.
 */

export type CardRarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'SUPERVISOR';

export type CardType = 'CHARACTER' | 'INCIDENT' | 'EQUIPMENT' | 'POLICY';

export type Department = 'TECH' | 'BOOKING' | 'FACILITIES' | 'ADMIN' | 'CHAOS';

export interface GameViewCard {
  id: string;
  templateId: string;
  name: string;
  cardType: CardType;
  rarity: CardRarity;
  department: Department;
  shiftCost: number;
  efficiency: number;         // Combat Power
  stamina: number;            // Current Stamina
  maxStamina: number;         // Maximum Stamina
  staminaBuffer?: number;     // Option A Ablative Shield
  influence: number;          // Terminal Victory & Queue Pressure
  keywords: string[];
  abilityName?: string;
  abilityDesc?: string;
  flavor: string;
  avatarGradient: string;
  iconName: string;
  imageUrl?: string;          // Support for original scanned card artwork
  isExhausted?: boolean;
  isGuard?: boolean;
  isSilenced?: boolean;
  isBuffered?: boolean;
  attachments?: string[];
}

export interface BattlefieldSlotView {
  slotIndex: number;          // 0 to 4 (5-slot tactical board)
  character: GameViewCard | null;
}

export interface QueueTicketView {
  id: string;
  ticketNumber: string;
  card: GameViewCard;
  turnsRemaining: number;
  owner: 'PLAYER' | 'OPPONENT';
  priorityLevel: 'STANDARD' | 'EXPEDITED' | 'OVERDUE';
}

export type TurnPhase = 
  | 'SHIFT_START' 
  | 'SHIFT_BUDGETING' 
  | 'ADMINISTRATIVE_DRAW' 
  | 'OPERATIONAL_ACTION' 
  | 'CLOCK_OUT';

export interface PlayerStateView {
  id: string;
  name: string;
  title: string;
  department: Department;
  avatarGradient: string;
  morale: number;
  maxMorale: number;
  shiftAvailable: number;
  shiftCap: number;
  hand: GameViewCard[];
  deckCount: number;
  discardCount: number;
  battlefield: BattlefieldSlotView[];
}

export interface PendingDecisionView {
  id: string;
  title: string;
  description: string;
  sourceCard: GameViewCard;
  targetFilter: 'FRIENDLY_CHARACTER' | 'ENEMY_CHARACTER' | 'ANY_CHARACTER' | 'SUPERVISOR';
  eligibleSlots: { side: 'PLAYER' | 'OPPONENT'; slotIndex: number }[];
}

export interface CombatEventLog {
  id: string;
  turn: number;
  timestamp: string;
  attackerName: string;
  attackerPlayer: 'PLAYER' | 'OPPONENT';
  targetName: string;
  damage: number;
  counterDamage?: number;
  isDirectAttack: boolean;
}

export interface VisualGameState {
  matchId: string;
  turnNumber: number;
  activePhase: TurnPhase;
  activePlayerSide: 'PLAYER' | 'OPPONENT';
  player: PlayerStateView;
  opponent: PlayerStateView;
  queue: QueueTicketView[];
  pendingDecision: PendingDecisionView | null;
  recentCombatLog: CombatEventLog[];
  isMatchFinished: boolean;
  winner: 'PLAYER' | 'OPPONENT' | null;
}

export type VisualScreenType = 
  | 'BATTLEFIELD'
  | 'MAIN_MENU'
  | 'DECK_BUILDER'
  | 'COLLECTION'
  | 'ARCHIVE'
  | 'SETTINGS'
  | 'COMMAND_CENTER';
