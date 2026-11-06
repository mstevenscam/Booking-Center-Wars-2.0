/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2C-A: Centralized Card Ability Engine & Effect Taxonomy
 * 
 * Implements authoritative ability resolution from:
 * - CARD_ABILITY_LIBRARY.md
 * - CARD_DATA_SCHEMA.md
 * - FINALIZED_COMBAT_RULES.md (Option A Stamina Buffer)
 * - RULE_DECISION_LOG.md
 * 
 * Architectural Guarantees:
 * 1. Data-Driven: Abilities are purely declarative definitions (no executable code on cards).
 * 2. Deterministic & Atomic: State mutations resolve in strict FIFO order with fizzle protection.
 * 3. Infinite Cascade Guard: MAX_TRIGGER_DEPTH = 10, MAX_EXECUTION_BUDGET = 50.
 * 4. Interactive Target Flow: Non-atomic targeting pauses via PendingAbilityTargetDecision.
 * 5. Complete Zone & State Invariant Safety.
 */

import {
  GameState,
  PlayerId,
  CharacterSlot,
  CardInstance,
  ZoneType
} from './state.js';
import { evaluateStateBasedActions } from './turn_manager.js';

// ============================================================================
// 1. CANONICAL TAXONOMY & TYPES
// ============================================================================

export type TriggerCondition =
  | 'ON_PLAY'            // Triggers only when manually played from hand during Phase 4
  | 'ON_DEPLOY'          // Triggers whenever physically entering battlefield (hand, queue, resummon)
  | 'ON_CLOCK_OUT'       // Triggers when Stamina reaches 0 and character clocks out to Breakroom
  | 'ON_ATTACK'          // Triggers when character declares an attack
  | 'ON_DAMAGE_TAKEN'    // Triggers when character's Stamina is reduced
  | 'START_OF_SHIFT'     // Triggers at start of player turn (Phase 1)
  | 'END_OF_SHIFT';      // Triggers at conclusion of player turn (Phase 5)

export type EffectType =
  | 'DAMAGE'
  | 'HEAL_STAMINA'
  | 'HEAL_MORALE'
  | 'BUFF_STAT'
  | 'DRAW_CARDS'
  | 'DISCARD_CARDS'
  | 'MODIFY_SHIFT'
  | 'DISRUPT_QUEUE'
  | 'SILENCE_CHARACTER'
  | 'RETURN_TO_HAND'
  | 'DESTROY_CHARACTER';

export type AbilityEffectType = EffectType;

export type TargetFilter =
  | 'SELF'
  | 'ANY_FRIENDLY_CHARACTER'
  | 'ANY_ENEMY_CHARACTER'
  | 'ALL_FRIENDLY_CHARACTERS'
  | 'ALL_ENEMY_CHARACTERS'
  | 'ALL_CHARACTERS'
  | 'ENEMY_SUPERVISOR'
  | 'FRIENDLY_SUPERVISOR'
  | 'BOTH_SUPERVISORS'
  | 'ANY_TARGET'
  | 'PENDING_QUEUE_TICKET'
  | 'ALL_FRIENDLY_QUEUE'
  | 'RANDOM_ENEMY_CHARACTER'
  | 'RANDOM_FRIENDLY_CHARACTER'
  | 'ATTACKER';

export interface AbilityDefinition {
  abilityId: string;
  name: string;
  trigger: TriggerCondition;
  targetFilter: TargetFilter;
  effectType: EffectType;
  primaryValue: number;          // e.g. 3 damage, 2 cards, +1 Power
  secondaryValue?: number;        // e.g. secondary stat buff, duration in turns
  duration?: 'PERMANENT' | 'UNTIL_END_OF_TURN';
  customDescription: string;      // Canonical card text
  requiresManualTarget?: boolean; // True if player must manually choose target
}

export type AbilityTarget =
  | { type: 'CHARACTER'; characterInstanceId: string }
  | { type: 'SUPERVISOR'; playerId: PlayerId }
  | { type: 'BOTH_SUPERVISORS' }
  | { type: 'QUEUE_TICKET'; ticketId: string; ownerId: PlayerId }
  | { type: 'ALL_FRIENDLY' }
  | { type: 'ALL_ENEMY' }
  | { type: 'ALL_CHARACTERS' }
  | { type: 'ALL_QUEUE' }
  | { type: 'SELF' }
  | { type: 'NONE' };

export interface AbilityExecutionResult {
  success: boolean;
  code?: string;
  error?: string;
  fizzled?: boolean;
  events: string[];
}

export interface TriggerContext {
  trigger: TriggerCondition;
  sourceInstanceId: string;
  sourcePlayerId: PlayerId;
  attackerSlot?: CharacterSlot;
  damageAmount?: number;
  departingCard?: CardInstance;
}

export interface ExecutionContext {
  depth: number;
  budgetCount: number;
}

// Global safety constraints from CARD_ABILITY_LIBRARY.md §2
export const MAX_TRIGGER_DEPTH = 10;
export const MAX_EXECUTION_BUDGET = 50;

/**
 * Deterministic seeded Pseudo-Random Number Generator (standard Mulberry32).
 * State is stored in GameState.rngState (32-bit unsigned integer) ensuring
 * full serializability, save/load preservation, and deterministic replays.
 * Completely avoids Math.random().
 * 
 * In standard Mulberry32, state progression strictly advances the 32-bit seed
 * by +0x6D2B79F5 modulo 2^32. The intermediate mixing calculations generate the
 * [0, 1) float return value without mutating or overwriting the seed sequence.
 */
export function nextRandom(state: GameState): number {
  if (state.rngState === undefined) {
    state.rngState = 123456789;
  }
  state.rngState = (state.rngState + 0x6D2B79F5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextRandomInt(state: GameState, min: number, maxInclusive: number): number {
  const r = nextRandom(state);
  return min + Math.floor(r * (maxInclusive - min + 1));
}

export function pickRandom<T>(state: GameState, array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  const idx = Math.floor(nextRandom(state) * array.length);
  return array[idx];
}

// ============================================================================
// 2. STANDARDIZED CANONICAL ABILITIES REGISTRY
// ============================================================================

export const CANONICAL_ABILITY_CATALOG: Record<string, AbilityDefinition> = {
  // Booking Specialist Department
  ABILITY_FAST_TRACK: {
    abilityId: 'ABILITY_FAST_TRACK',
    name: 'Fast Track',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ALL_FRIENDLY_QUEUE',
    effectType: 'DISRUPT_QUEUE',
    primaryValue: -1, // Reduce countdown by 1 turn
    customDescription: 'Reduce the countdown of all tickets currently in your Booking Queue by 1 turn.'
  },
  ABILITY_RESERVATION_HOLD: {
    abilityId: 'ABILITY_RESERVATION_HOLD',
    name: 'Reservation Hold',
    trigger: 'ON_PLAY',
    targetFilter: 'PENDING_QUEUE_TICKET',
    effectType: 'DISRUPT_QUEUE',
    primaryValue: 1, // Delay target opposing queue ticket by +1 turn
    requiresManualTarget: true,
    customDescription: 'Delay target opposing queue ticket by +1 turn.'
  },
  ABILITY_EXPRESS_CHECKOUT: {
    abilityId: 'ABILITY_EXPRESS_CHECKOUT',
    name: 'Express Checkout',
    trigger: 'ON_DEPLOY',
    targetFilter: 'SELF',
    effectType: 'DRAW_CARDS',
    primaryValue: 1,
    customDescription: 'Draw 1 card.'
  },

  // Technician Department
  ABILITY_GAFFER_TAPE_PATCH: {
    abilityId: 'ABILITY_GAFFER_TAPE_PATCH',
    name: 'Gaffer Tape Patch',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ANY_FRIENDLY_CHARACTER',
    effectType: 'HEAL_STAMINA',
    primaryValue: 3,
    requiresManualTarget: true,
    customDescription: 'Restore 3 Stamina to target friendly character.'
  },
  ABILITY_BENCH_TEST: {
    abilityId: 'ABILITY_BENCH_TEST',
    name: 'Bench Test',
    trigger: 'START_OF_SHIFT',
    targetFilter: 'RANDOM_FRIENDLY_CHARACTER',
    effectType: 'BUFF_STAT',
    primaryValue: 1, // +1 Efficiency
    secondaryValue: 1, // +1 Stamina
    duration: 'PERMANENT',
    customDescription: 'Give a random friendly character +1/+1 at the start of your shift.'
  },

  // Administration Department
  ABILITY_MANDATORY_REVIEW: {
    abilityId: 'ABILITY_MANDATORY_REVIEW',
    name: 'Mandatory Review',
    trigger: 'ON_PLAY',
    targetFilter: 'ANY_ENEMY_CHARACTER',
    effectType: 'RETURN_TO_HAND',
    primaryValue: 0,
    requiresManualTarget: true,
    customDescription: 'Return an opposing character to its owner\'s hand.'
  },

  // Equipment Specialist Department
  ABILITY_HEAVY_FLIGHT_CASE: {
    abilityId: 'ABILITY_HEAVY_FLIGHT_CASE',
    name: 'Heavy Flight Case',
    trigger: 'ON_DAMAGE_TAKEN',
    targetFilter: 'ATTACKER',
    effectType: 'DAMAGE',
    primaryValue: 1,
    customDescription: 'Whenever this character takes damage, deal 1 damage to the attacker.'
  },
  ABILITY_CAGE_LOCKDOWN: {
    abilityId: 'ABILITY_CAGE_LOCKDOWN',
    name: 'Cage Lockdown',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ALL_FRIENDLY_CHARACTERS',
    effectType: 'BUFF_STAT',
    primaryValue: 0, // 0 Efficiency
    secondaryValue: 2, // +2 Stamina (Option A temporary buffer)
    duration: 'UNTIL_END_OF_TURN',
    customDescription: 'Give all friendly characters +2 Stamina this turn.'
  },

  // Journalism Department
  ABILITY_EXPOSÉ_REPORT: {
    abilityId: 'ABILITY_EXPOSÉ_REPORT',
    name: 'Exposé Report',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ENEMY_SUPERVISOR',
    effectType: 'DAMAGE',
    primaryValue: 2,
    customDescription: 'Deal 2 damage to enemy Supervisor.'
  },

  // Production Department
  ABILITY_ROLLING_SOUND: {
    abilityId: 'ABILITY_ROLLING_SOUND',
    name: 'Rolling Sound',
    trigger: 'ON_ATTACK',
    targetFilter: 'ALL_FRIENDLY_CHARACTERS',
    effectType: 'BUFF_STAT',
    primaryValue: 1, // +1 Efficiency
    secondaryValue: 0,
    duration: 'UNTIL_END_OF_TURN',
    customDescription: 'Whenever this character attacks, friendly characters gain +1 Power this turn.'
  },

  // Problem Solver Department
  ABILITY_ROOT_CAUSE_ANALYSIS: {
    abilityId: 'ABILITY_ROOT_CAUSE_ANALYSIS',
    name: 'Root Cause Analysis',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ANY_ENEMY_CHARACTER',
    effectType: 'SILENCE_CHARACTER',
    primaryValue: 0,
    requiresManualTarget: true,
    customDescription: 'Silence target enemy character (removes all abilities and keyword buffs).'
  },

  // Chaos Agent Department
  ABILITY_UNATTENDED_RODENT: {
    abilityId: 'ABILITY_UNATTENDED_RODENT',
    name: 'Unattended Rodent',
    trigger: 'ON_CLOCK_OUT',
    targetFilter: 'RANDOM_ENEMY_CHARACTER',
    effectType: 'DAMAGE',
    primaryValue: 2,
    customDescription: 'When this character clocks out, deal 2 damage to a random enemy character.'
  },

  // Core Generic Baseline Abilities
  ABILITY_DIRECT_REPAIR: {
    abilityId: 'ABILITY_DIRECT_REPAIR',
    name: 'Direct Repair',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ANY_FRIENDLY_CHARACTER',
    effectType: 'HEAL_STAMINA',
    primaryValue: 2,
    requiresManualTarget: true,
    customDescription: 'Restore 2 Stamina to target friendly character.'
  },
  ABILITY_FIELD_PROMOTION: {
    abilityId: 'ABILITY_FIELD_PROMOTION',
    name: 'Field Promotion',
    trigger: 'ON_DEPLOY',
    targetFilter: 'ANY_FRIENDLY_CHARACTER',
    effectType: 'BUFF_STAT',
    primaryValue: 1, // +1 Power
    secondaryValue: 1, // +1 Stamina
    duration: 'PERMANENT',
    requiresManualTarget: true,
    customDescription: 'Give a friendly character +1/+1.'
  },
  ABILITY_EMERGENCY_FUNDING: {
    abilityId: 'ABILITY_EMERGENCY_FUNDING',
    name: 'Emergency Funding',
    trigger: 'ON_PLAY',
    targetFilter: 'SELF',
    effectType: 'MODIFY_SHIFT',
    primaryValue: 1, // +1 temporary Shift
    customDescription: 'Gain 1 temporary Shift Hour this turn.'
  },
  ABILITY_SUPERVISOR_COUNSEL: {
    abilityId: 'ABILITY_SUPERVISOR_COUNSEL',
    name: 'Supervisor Counsel',
    trigger: 'ON_DEPLOY',
    targetFilter: 'FRIENDLY_SUPERVISOR',
    effectType: 'HEAL_MORALE',
    primaryValue: 4,
    customDescription: 'Restore 4 Morale to your Supervisor.'
  },
  ABILITY_DISCIPLINARY_DISMISSAL: {
    abilityId: 'ABILITY_DISCIPLINARY_DISMISSAL',
    name: 'Disciplinary Dismissal',
    trigger: 'ON_PLAY',
    targetFilter: 'ANY_ENEMY_CHARACTER',
    effectType: 'DESTROY_CHARACTER',
    primaryValue: 0,
    requiresManualTarget: true,
    customDescription: 'Retire an enemy character directly to the Breakroom.'
  }
};

// ============================================================================
// 3. TARGETING & VALIDATION PIPELINE
// ============================================================================

/**
 * Evaluates whether an AbilityTarget is valid for a given TargetFilter in the current state.
 * Validates target type, character existence, battlefield location, ownership,
 * queue-ticket existence and ownership, supervisor identity, and attacker identity.
 */
export function isTargetLegal(
  state: GameState,
  actingPlayerId: PlayerId,
  filter: TargetFilter,
  target: AbilityTarget,
  sourceInstanceId?: string,
  context?: TriggerContext,
  effectType?: AbilityEffectType
): boolean {
  if (!target || typeof target !== 'object') return false;

  const opponentId: PlayerId = actingPlayerId === 'p1' ? 'p2' : 'p1';
  const friendly = state.players[actingPlayerId];
  const opponent = state.players[opponentId];

  switch (filter) {
    case 'SELF': {
      // Permit NONE only if the effect genuinely does not require a character target (e.g. DRAW_CARDS, MODIFY_SHIFT)
      if (target.type === 'NONE') {
        if (effectType) {
          const characterTargetingEffects: EffectType[] = [
            'DAMAGE',
            'HEAL_STAMINA',
            'BUFF_STAT',
            'SILENCE_CHARACTER',
            'RETURN_TO_HAND',
            'DESTROY_CHARACTER'
          ];
          if (characterTargetingEffects.includes(effectType)) {
            return false;
          }
          return true;
        }
        return true;
      }

      if (!sourceInstanceId) return false;
      if (target.type !== 'SELF' && target.type !== 'CHARACTER') return false;
      if (target.type === 'CHARACTER' && target.characterInstanceId !== sourceInstanceId) return false;

      // 1. ON_CLOCK_OUT abilities strictly require a legitimate captured departing-card snapshot.
      //    Living characters remaining on the battlefield cannot fire or target ON_CLOCK_OUT.
      if (context && context.trigger === 'ON_CLOCK_OUT') {
        if (
          context.departingCard &&
          context.departingCard.instanceId === sourceInstanceId &&
          context.departingCard.ownerId === actingPlayerId &&
          (!context.sourcePlayerId || context.sourcePlayerId === actingPlayerId)
        ) {
          return true;
        }
        return false;
      }

      // 2. Normal living SELF abilities must reference a valid living source character on friendly battlefield belonging to the acting player.
      const livingFriendlySlot = friendly.battlefield.find(
        s => s.card.instanceId === sourceInstanceId && s.card.ownerId === actingPlayerId && s.card.stamina > 0
      );
      if (livingFriendlySlot) {
        return true;
      }

      // Reject stale, missing, or mismatched source identities.
      return false;
    }

    case 'ANY_FRIENDLY_CHARACTER': {
      if (target.type !== 'CHARACTER' || !target.characterInstanceId) return false;
      return friendly.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
    }

    case 'ANY_ENEMY_CHARACTER': {
      if (target.type !== 'CHARACTER' || !target.characterInstanceId) return false;
      return opponent.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
    }

    case 'ANY_TARGET': {
      if (target.type === 'SUPERVISOR') {
        return target.playerId === 'p1' || target.playerId === 'p2';
      }
      if (target.type === 'CHARACTER') {
        if (!target.characterInstanceId) return false;
        const inFriendly = friendly.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
        const inOpponent = opponent.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
        return inFriendly || inOpponent;
      }
      return false;
    }

    case 'FRIENDLY_SUPERVISOR': {
      return target.type === 'SUPERVISOR' && target.playerId === actingPlayerId;
    }

    case 'ENEMY_SUPERVISOR': {
      return target.type === 'SUPERVISOR' && target.playerId === opponentId;
    }

    case 'BOTH_SUPERVISORS': {
      return target.type === 'BOTH_SUPERVISORS';
    }

    case 'PENDING_QUEUE_TICKET': {
      if (target.type !== 'QUEUE_TICKET' || !target.ticketId) return false;
      if (target.ownerId && target.ownerId !== opponentId) return false;
      return opponent.queue.some(t => t.id === target.ticketId);
    }

    case 'ALL_FRIENDLY_CHARACTERS': {
      return target.type === 'ALL_FRIENDLY';
    }

    case 'ALL_ENEMY_CHARACTERS': {
      return target.type === 'ALL_ENEMY';
    }

    case 'ALL_CHARACTERS': {
      return target.type === 'ALL_CHARACTERS';
    }

    case 'ALL_FRIENDLY_QUEUE': {
      return target.type === 'ALL_QUEUE';
    }

    case 'RANDOM_ENEMY_CHARACTER': {
      if (target.type === 'NONE') return true;
      if (target.type === 'CHARACTER') {
        if (!target.characterInstanceId) return false;
        return opponent.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
      }
      return false;
    }

    case 'RANDOM_FRIENDLY_CHARACTER': {
      if (target.type === 'NONE') return true;
      if (target.type === 'CHARACTER') {
        if (!target.characterInstanceId) return false;
        return friendly.battlefield.some(s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0);
      }
      return false;
    }

    case 'ATTACKER': {
      // 5. Permit NONE only where the corresponding effect genuinely requires no explicit character target.
      if (target.type === 'NONE') {
        if (effectType) {
          const characterTargetingEffects: EffectType[] = [
            'DAMAGE',
            'HEAL_STAMINA',
            'BUFF_STAT',
            'SILENCE_CHARACTER',
            'RETURN_TO_HAND',
            'DESTROY_CHARACTER'
          ];
          if (characterTargetingEffects.includes(effectType)) {
            return false;
          }
        }
        return true;
      }

      if (target.type === 'CHARACTER') {
        if (!target.characterInstanceId) return false;
        // 1. If an attacker identity is available, the selected target must match that exact attacker.
        // 2. If attacker identity is unavailable, reject a CHARACTER target.
        if (!context || !context.attackerSlot || !context.attackerSlot.card) {
          return false;
        }
        if (target.characterInstanceId !== context.attackerSlot.card.instanceId) {
          return false;
        }
        // 3. Never substitute the opposing battlefield as a fallback attacker list.
        // 4. Validate that the attacker identity is consistent with the actual combat event (alive on opponent's battlefield).
        return opponent.battlefield.some(
          s => s.card.instanceId === target.characterInstanceId && s.card.stamina > 0
        );
      }

      return false;
    }

    default:
      return false;
  }
}

/**
 * Returns all legal targets for a given ability definition and acting player.
 */
export function getLegalAbilityTargets(
  state: GameState,
  actingPlayerId: PlayerId,
  sourceInstanceId: string,
  ability: AbilityDefinition
): AbilityTarget[] {
  const opponentId: PlayerId = actingPlayerId === 'p1' ? 'p2' : 'p1';
  const friendly = state.players[actingPlayerId];
  const opponent = state.players[opponentId];
  const targets: AbilityTarget[] = [];

  switch (ability.targetFilter) {
    case 'SELF':
      targets.push({ type: 'CHARACTER', characterInstanceId: sourceInstanceId });
      break;

    case 'ANY_FRIENDLY_CHARACTER':
      for (const slot of friendly.battlefield) {
        if (slot.card.stamina > 0) {
          targets.push({ type: 'CHARACTER', characterInstanceId: slot.card.instanceId });
        }
      }
      break;

    case 'ANY_ENEMY_CHARACTER':
      for (const slot of opponent.battlefield) {
        if (slot.card.stamina > 0) {
          targets.push({ type: 'CHARACTER', characterInstanceId: slot.card.instanceId });
        }
      }
      break;

    case 'ANY_TARGET':
      for (const slot of friendly.battlefield) {
        if (slot.card.stamina > 0) targets.push({ type: 'CHARACTER', characterInstanceId: slot.card.instanceId });
      }
      for (const slot of opponent.battlefield) {
        if (slot.card.stamina > 0) targets.push({ type: 'CHARACTER', characterInstanceId: slot.card.instanceId });
      }
      targets.push({ type: 'SUPERVISOR', playerId: actingPlayerId });
      targets.push({ type: 'SUPERVISOR', playerId: opponentId });
      break;

    case 'FRIENDLY_SUPERVISOR':
      targets.push({ type: 'SUPERVISOR', playerId: actingPlayerId });
      break;

    case 'ENEMY_SUPERVISOR':
      targets.push({ type: 'SUPERVISOR', playerId: opponentId });
      break;

    case 'BOTH_SUPERVISORS':
      targets.push({ type: 'BOTH_SUPERVISORS' });
      break;

    case 'PENDING_QUEUE_TICKET':
      for (const ticket of opponent.queue) {
        targets.push({ type: 'QUEUE_TICKET', ticketId: ticket.id, ownerId: opponentId });
      }
      break;

    case 'ALL_FRIENDLY_CHARACTERS':
      targets.push({ type: 'ALL_FRIENDLY' });
      break;

    case 'ALL_ENEMY_CHARACTERS':
      targets.push({ type: 'ALL_ENEMY' });
      break;

    case 'ALL_CHARACTERS':
      targets.push({ type: 'ALL_CHARACTERS' });
      break;

    case 'ALL_FRIENDLY_QUEUE':
      targets.push({ type: 'ALL_QUEUE' });
      break;

    case 'RANDOM_ENEMY_CHARACTER':
    case 'RANDOM_FRIENDLY_CHARACTER':
    case 'ATTACKER':
      targets.push({ type: 'NONE' });
      break;
  }

  return targets;
}

// ============================================================================
// 4. ATOMIC EFFECT EXECUTION ENGINE
// ============================================================================

/**
 * Resolves an individual ability effect atomically.
 * Includes Fizzle Guard: if a designated target is no longer in play, resolves safely without error.
 */
export function resolveAbilityEffect(
  state: GameState,
  actingPlayerId: PlayerId,
  sourceInstanceId: string,
  ability: AbilityDefinition,
  target: AbilityTarget,
  execContext?: ExecutionContext,
  triggerContext?: TriggerContext
): AbilityExecutionResult {
  const events: string[] = [];
  const opponentId: PlayerId = actingPlayerId === 'p1' ? 'p2' : 'p1';
  const friendly = state.players[actingPlayerId];
  const opponent = state.players[opponentId];

  if (state.status === 'COMPLETED') {
    return { success: false, code: 'MATCH_COMPLETED', error: 'Match is already completed.', events: [] };
  }

  // Revalidate target legality immediately before effect resolution (Task 1 requirement 6)
  if (!isTargetLegal(state, actingPlayerId, ability.targetFilter, target, sourceInstanceId, triggerContext, ability.effectType)) {
    events.push(`Ability [${ability.name}] fizzled: target is no longer legal.`);
    return { success: true, fizzled: true, events };
  }

  switch (ability.effectType) {
    case 'DAMAGE': {
      const dmg = Math.max(0, ability.primaryValue);
      if (target.type === 'SUPERVISOR') {
        const sup = state.players[target.playerId];
        sup.morale = Math.max(0, sup.morale - dmg);
        events.push(`Ability [${ability.name}] dealt ${dmg} damage to Player ${target.playerId.toUpperCase()}'s Morale (Remaining: ${sup.morale}).`);
      } else if (target.type === 'BOTH_SUPERVISORS' || ability.targetFilter === 'BOTH_SUPERVISORS') {
        state.players.p1.morale = Math.max(0, state.players.p1.morale - dmg);
        state.players.p2.morale = Math.max(0, state.players.p2.morale - dmg);
        events.push(`Ability [${ability.name}] dealt ${dmg} damage to Both Supervisors (P1: ${state.players.p1.morale}, P2: ${state.players.p2.morale}).`);
      } else if (target.type === 'CHARACTER' || target.type === 'SELF') {
        const targetId = target.type === 'CHARACTER' ? target.characterInstanceId : sourceInstanceId;
        const allSlots = [...friendly.battlefield, ...opponent.battlefield];
        const slot = allSlots.find(s => s.card.instanceId === targetId);
        if (!slot || slot.card.stamina <= 0) {
          events.push(`Ability [${ability.name}] fizzled: target character no longer on battlefield.`);
          return { success: true, fizzled: true, events };
        }
        slot.card.stamina = Math.max(0, slot.card.stamina - dmg);
        events.push(`Ability [${ability.name}] dealt ${dmg} damage to ${slot.card.cardDefId} (Remaining Stamina: ${slot.card.stamina}).`);
        
        // Dispatch ON_DAMAGE_TAKEN whenever damage reduces stamina, INCLUDING lethal damage
        if (dmg > 0) {
          const ownerId: PlayerId = friendly.battlefield.some(s => s.card.instanceId === slot.card.instanceId) ? actingPlayerId : opponentId;
          const sourceSlot = friendly.battlefield.find(s => s.card.instanceId === sourceInstanceId) || opponent.battlefield.find(s => s.card.instanceId === sourceInstanceId);
          // Never identify the damaged character as its own attacker
          const attackerSlot = (sourceSlot && sourceSlot.card.instanceId !== slot.card.instanceId) ? sourceSlot : undefined;
          const dmgRes = dispatchTriggers(state, 'ON_DAMAGE_TAKEN', {
            trigger: 'ON_DAMAGE_TAKEN',
            sourceInstanceId: slot.card.instanceId,
            sourcePlayerId: ownerId,
            attackerSlot,
            damageAmount: dmg
          }, execContext);
          events.push(...dmgRes.events);
        }
      } else if (ability.targetFilter === 'RANDOM_ENEMY_CHARACTER') {
        const validOpponents = opponent.battlefield.filter(s => s.card.stamina > 0);
        if (validOpponents.length === 0) {
          opponent.morale = Math.max(0, opponent.morale - dmg);
          events.push(`Ability [${ability.name}] found no enemy units; dealt ${dmg} splash damage to Player ${opponentId.toUpperCase()}'s Morale.`);
        } else {
          // Deterministic pseudo-random selection using PRNG
          const idx = Math.floor(nextRandom(state) * validOpponents.length);
          const chosen = validOpponents[idx];
          chosen.card.stamina = Math.max(0, chosen.card.stamina - dmg);
          events.push(`Ability [${ability.name}] struck ${chosen.card.cardDefId} for ${dmg} damage.`);
          if (dmg > 0) {
            const sourceSlot = friendly.battlefield.find(s => s.card.instanceId === sourceInstanceId) || opponent.battlefield.find(s => s.card.instanceId === sourceInstanceId);
            // Never identify the damaged character as its own attacker
            const attackerSlot = (sourceSlot && sourceSlot.card.instanceId !== chosen.card.instanceId) ? sourceSlot : undefined;
            const dmgRes = dispatchTriggers(state, 'ON_DAMAGE_TAKEN', {
              trigger: 'ON_DAMAGE_TAKEN',
              sourceInstanceId: chosen.card.instanceId,
              sourcePlayerId: opponentId,
              attackerSlot,
              damageAmount: dmg
            }, execContext);
            events.push(...dmgRes.events);
          }
        }
      }
      break;
    }

    case 'HEAL_STAMINA': {
      const heal = Math.max(0, ability.primaryValue);
      if (target.type === 'CHARACTER' || target.type === 'SELF') {
        const targetId = target.type === 'CHARACTER' ? target.characterInstanceId : sourceInstanceId;
        const slot = friendly.battlefield.find(s => s.card.instanceId === targetId);
        if (!slot) {
          events.push(`Ability [${ability.name}] fizzled: target character not found.`);
          return { success: true, fizzled: true, events };
        }
        const effectiveMax = slot.card.maxStamina;
        const prev = slot.card.stamina;
        slot.card.stamina = Math.min(effectiveMax, slot.card.stamina + heal);
        const restored = slot.card.stamina - prev;
        events.push(`Ability [${ability.name}] restored ${restored} Stamina to ${slot.card.cardDefId} (${slot.card.stamina}/${effectiveMax}).`);
      }
      break;
    }

    case 'HEAL_MORALE': {
      const heal = Math.max(0, ability.primaryValue);
      if (target.type === 'BOTH_SUPERVISORS' || ability.targetFilter === 'BOTH_SUPERVISORS') {
        const prev1 = state.players.p1.morale;
        state.players.p1.morale = Math.min(state.players.p1.maxMorale, state.players.p1.morale + heal);
        const restored1 = state.players.p1.morale - prev1;
        const prev2 = state.players.p2.morale;
        state.players.p2.morale = Math.min(state.players.p2.maxMorale, state.players.p2.morale + heal);
        const restored2 = state.players.p2.morale - prev2;
        events.push(`Ability [${ability.name}] restored Morale to Both Supervisors (P1: +${restored1} to ${state.players.p1.morale}/${state.players.p1.maxMorale}, P2: +${restored2} to ${state.players.p2.morale}/${state.players.p2.maxMorale}).`);
      } else if (target.type === 'SUPERVISOR') {
        const targetPlayer = state.players[target.playerId];
        const prev = targetPlayer.morale;
        targetPlayer.morale = Math.min(targetPlayer.maxMorale, targetPlayer.morale + heal);
        const restored = targetPlayer.morale - prev;
        events.push(`Ability [${ability.name}] restored ${restored} Morale to Player ${target.playerId.toUpperCase()} (Morale: ${targetPlayer.morale}/${targetPlayer.maxMorale}).`);
      } else {
        const prev = friendly.morale;
        friendly.morale = Math.min(friendly.maxMorale, friendly.morale + heal);
        const restored = friendly.morale - prev;
        events.push(`Ability [${ability.name}] restored ${restored} Morale to Player ${actingPlayerId.toUpperCase()} (Morale: ${friendly.morale}/${friendly.maxMorale}).`);
      }
      break;
    }

    case 'BUFF_STAT': {
      const effBuff = ability.primaryValue;
      const staBuff = ability.secondaryValue || 0;
      const isTemporary = ability.duration === 'UNTIL_END_OF_TURN' ||
        (ability.duration === undefined && ability.customDescription.toLowerCase().includes('this turn'));

      const applyBuffToSlot = (slot: CharacterSlot) => {
        if (effBuff > 0) {
          slot.card.efficiency = Math.max(0, slot.card.efficiency + effBuff);
          if (isTemporary) {
            slot.card.temporaryEfficiencyBuffer = (slot.card.temporaryEfficiencyBuffer || 0) + effBuff;
          }
        }
        if (staBuff > 0) {
          slot.card.stamina += staBuff;
          slot.card.maxStamina += staBuff;
          if (isTemporary) {
            slot.card.temporaryStaminaBuffer = (slot.card.temporaryStaminaBuffer || 0) + staBuff;
          }
        }
      };

      if (ability.targetFilter === 'ALL_FRIENDLY_CHARACTERS' || target.type === 'ALL_FRIENDLY') {
        for (const slot of friendly.battlefield) {
          applyBuffToSlot(slot);
        }
        events.push(`Ability [${ability.name}] buffed all friendly characters (+${effBuff} Eff / +${staBuff} Sta${isTemporary ? ' this turn' : ' permanent'}).`);
      } else if (ability.targetFilter === 'RANDOM_FRIENDLY_CHARACTER') {
        if (friendly.battlefield.length > 0) {
          const idx = Math.floor(nextRandom(state) * friendly.battlefield.length);
          const slot = friendly.battlefield[idx];
          applyBuffToSlot(slot);
          events.push(`Ability [${ability.name}] buffed ${slot.card.cardDefId} (+${effBuff} Eff / +${staBuff} Sta${isTemporary ? ' this turn' : ' permanent'}).`);
        }
      } else if (target.type === 'CHARACTER') {
        const slot = friendly.battlefield.find(s => s.card.instanceId === target.characterInstanceId);
        if (slot) {
          applyBuffToSlot(slot);
          events.push(`Ability [${ability.name}] buffed ${slot.card.cardDefId} (+${effBuff} Eff / +${staBuff} Sta${isTemporary ? ' this turn' : ' permanent'}).`);
        }
      }
      break;
    }

    case 'DRAW_CARDS': {
      const count = Math.max(0, ability.primaryValue);
      for (let i = 0; i < count; i++) {
        if (friendly.deck.length === 0) {
          friendly.fatigueCount += 1;
          friendly.morale -= friendly.fatigueCount;
          events.push(`Fatigue Burnout! Deck empty. Player ${actingPlayerId.toUpperCase()} took ${friendly.fatigueCount} fatigue damage.`);
        } else {
          const drawn = friendly.deck.shift()!;
          if (friendly.hand.length < 8) {
            drawn.currentZone = 'HAND';
            friendly.hand.push(drawn);
            events.push(`Player ${actingPlayerId.toUpperCase()} drew ${drawn.cardDefId} via [${ability.name}].`);
          } else {
            drawn.currentZone = 'BREAKROOM';
            friendly.breakroom.push(drawn);
            events.push(`Hand full (8 cards). Card ${drawn.cardDefId} burned to Breakroom via [${ability.name}].`);
          }
        }
      }
      break;
    }

    case 'MODIFY_SHIFT': {
      const amount = ability.primaryValue;
      if (amount > 0) {
        friendly.temporaryShift += amount;
        friendly.currentShift += amount;
        events.push(`Ability [${ability.name}] granted +${amount} temporary Shift Hour(s).`);
      } else if (amount < 0) {
        friendly.currentShift = Math.max(0, friendly.currentShift + amount);
        events.push(`Ability [${ability.name}] reduced current Shift by ${Math.abs(amount)}.`);
      }
      break;
    }

    case 'DISRUPT_QUEUE': {
      const delta = ability.primaryValue; // e.g. -1 (fast track) or +1 (delay)
      if (target.type === 'ALL_QUEUE' || ability.targetFilter === 'ALL_FRIENDLY_QUEUE') {
        for (const ticket of friendly.queue) {
          ticket.remainingTurns = Math.max(0, ticket.remainingTurns + delta);
        }
        events.push(`Ability [${ability.name}] modified all friendly queue tickets by ${delta > 0 ? `+${delta}` : delta} turn(s).`);
      } else if (target.type === 'QUEUE_TICKET') {
        const ticket = opponent.queue.find(t => t.id === target.ticketId);
        if (ticket) {
          ticket.remainingTurns = Math.max(0, ticket.remainingTurns + delta);
          events.push(`Ability [${ability.name}] modified ticket ${ticket.id} (${ticket.cardName}) by ${delta > 0 ? `+${delta}` : delta} turn(s).`);
        } else {
          events.push(`Ability [${ability.name}] fizzled: queue ticket not found.`);
          return { success: true, fizzled: true, events };
        }
      }
      break;
    }

    case 'SILENCE_CHARACTER': {
      if (target.type === 'CHARACTER') {
        const allSlots = [...friendly.battlefield, ...opponent.battlefield];
        const slot = allSlots.find(s => s.card.instanceId === target.characterInstanceId);
        if (slot) {
          slot.card.abilities = [];
          slot.card.hasOnDeployAbility = false;
          slot.card.isFrontDeskGuard = false;
          slot.card.isRush = false;
          slot.card.isFirstResponder = false;
          slot.card.isInfiltration = false;
          slot.card.isSilenced = true;
          slot.card.temporaryEfficiencyBuffer = 0;
          slot.card.temporaryStaminaBuffer = 0;

          // Reset to base card template statistics
          if (slot.card.baseTemplate) {
            slot.card.efficiency = slot.card.baseTemplate.efficiency;
            slot.card.maxStamina = slot.card.baseTemplate.stamina;
            slot.card.stamina = Math.min(slot.card.stamina, slot.card.baseTemplate.stamina);
            slot.card.influence = slot.card.baseTemplate.influence;
            slot.card.baseCost = slot.card.baseTemplate.baseCost;
            slot.card.currentCost = slot.card.baseTemplate.baseCost;
          }
          events.push(`Ability [${ability.name}] silenced ${slot.card.cardDefId} (Keywords and abilities stripped, temporary buffers cleared, stats reset to base template: Eff ${slot.card.efficiency}, Sta ${slot.card.stamina}/${slot.card.maxStamina}).`);
        }
      }
      break;
    }

    case 'RETURN_TO_HAND': {
      if (target.type === 'CHARACTER') {
        const allPlayers = [friendly, opponent];
        for (const player of allPlayers) {
          const idx = player.battlefield.findIndex(s => s.card.instanceId === target.characterInstanceId);
          if (idx >= 0) {
            const slot = player.battlefield.splice(idx, 1)[0];
            const card = slot.card;

            // Restore card-template statistics completely
            if (card.baseTemplate) {
              card.efficiency = card.baseTemplate.efficiency;
              card.stamina = card.baseTemplate.stamina;
              card.maxStamina = card.baseTemplate.stamina;
              card.influence = card.baseTemplate.influence;
              card.baseCost = card.baseTemplate.baseCost;
              card.currentCost = card.baseTemplate.baseCost;
              card.abilities = JSON.parse(JSON.stringify(card.baseTemplate.abilities));
              card.isFrontDeskGuard = Boolean(card.baseTemplate.isFrontDeskGuard);
              card.isRush = Boolean(card.baseTemplate.isRush);
              card.isFirstResponder = Boolean(card.baseTemplate.isFirstResponder);
              card.isInfiltration = Boolean(card.baseTemplate.isInfiltration);
              card.hasOnDeployAbility = Boolean(card.baseTemplate.hasOnDeployAbility);
            } else {
              card.stamina = card.maxStamina;
            }
            card.temporaryStaminaBuffer = 0;
            card.temporaryEfficiencyBuffer = 0;
            card.isSilenced = false;
            card.hasTriggeredClockOut = false;

            // Return to owner's hand (or Breakroom if full: max 8 cards)
            const targetOwner = state.players[card.ownerId];
            if (targetOwner.hand.length < 8) {
              card.currentZone = 'HAND';
              targetOwner.hand.push(card);
              events.push(`Ability [${ability.name}] returned ${card.cardDefId} to Player ${targetOwner.id.toUpperCase()}'s hand.`);
            } else {
              card.currentZone = 'BREAKROOM';
              targetOwner.breakroom.push(card);
              events.push(`Hand full (8 cards). Returned card ${card.cardDefId} burned to Breakroom.`);
            }
            // Note: RETURN_TO_HAND is an administrative recall and does NOT trigger ON_CLOCK_OUT
            break;
          }
        }
      }
      break;
    }

    case 'DESTROY_CHARACTER': {
      if (target.type === 'CHARACTER') {
        const allPlayers = [friendly, opponent];
        for (const player of allPlayers) {
          const idx = player.battlefield.findIndex(s => s.card.instanceId === target.characterInstanceId);
          if (idx >= 0) {
            const slot = player.battlefield.splice(idx, 1)[0];
            const departingCard = slot.card;
            departingCard.currentZone = 'BREAKROOM';
            player.breakroom.push(departingCard);
            events.push(`Ability [${ability.name}] retired ${departingCard.cardDefId} directly to Breakroom.`);

            // Departure event: Trigger ON_CLOCK_OUT if not already triggered
            if (!departingCard.hasTriggeredClockOut) {
              const clockOutRes = dispatchTriggers(state, 'ON_CLOCK_OUT', {
                trigger: 'ON_CLOCK_OUT',
                sourceInstanceId: departingCard.instanceId,
                sourcePlayerId: player.id,
                departingCard
              }, execContext);
              events.push(...clockOutRes.events);
            }
            break;
          }
        }
      }
      break;
    }

    default:
      events.push(`Ability [${ability.name}] effect ${ability.effectType} not recognized.`);
  }

  // Combat damage reactions are one atomic simultaneous-damage window. Their
  // state-based cleanup is deferred to the parent combat continuation so both
  // sides' ON_DAMAGE_TAKEN triggers resolve before zero-Stamina units clock out.
  if (triggerContext?.trigger !== 'ON_DAMAGE_TAKEN') {
    evaluateStateBasedActions(state, execContext);
  }

  state.historyLog.push(...events);
  return { success: true, events };
}

// ============================================================================
// 5. TRIGGER DISPATCHER & CASCADE SAFEGUARD
// ============================================================================

/**
 * Resets execution budgets between top-level user actions.
 * Maintained as backward-compatible no-op; execution contexts are now isolated per invocation.
 */
export function resetAbilityExecutionBudget(): void {
  // No-op: execution context is now passed down deterministically without module globals.
}

/**
 * Dispatches a lifecycle trigger to eligible characters or cards in play.
 * Prevents recursive trigger cascades beyond MAX_TRIGGER_DEPTH = 10 and MAX_EXECUTION_BUDGET = 50.
 * Isolated to invocation ExecutionContext (no module-level global state).
 */
export function dispatchTriggers(
  state: GameState,
  trigger: TriggerCondition,
  context: TriggerContext,
  execContext?: ExecutionContext
): { success: boolean; events: string[]; pendingDecisionCreated: boolean } {
  const events: string[] = [];

  if (state.status === 'COMPLETED') {
    return { success: true, events: [], pendingDecisionCreated: false };
  }

  const localExecContext: ExecutionContext = execContext || { depth: 0, budgetCount: 0 };

  // Infinite cascade protection
  if (localExecContext.depth >= MAX_TRIGGER_DEPTH) {
    events.push(`Trigger cascade limit reached (MAX_TRIGGER_DEPTH = ${MAX_TRIGGER_DEPTH}). Halting further cascades.`);
    state.historyLog.push(...events);
    return { success: false, events, pendingDecisionCreated: false };
  }

  localExecContext.depth += 1;

  try {
    const activePlayer = state.players[context.sourcePlayerId];
    const opponentId: PlayerId = context.sourcePlayerId === 'p1' ? 'p2' : 'p1';
    const opponent = state.players[opponentId];

    interface TriggerCandidate {
      slot?: CharacterSlot;
      departingCard?: CardInstance;
      ownerId: PlayerId;
      ability: AbilityDefinition;
    }

    const candidates: TriggerCandidate[] = [];

    // Departure trigger ON_CLOCK_OUT: strictly targets the specific departing unit
    if (trigger === 'ON_CLOCK_OUT') {
      const departing = context.departingCard;
      if (!departing) {
        events.push('ON_CLOCK_OUT rejected: Missing departing card snapshot.');
        return { success: false, events, pendingDecisionCreated: false };
      }
      if (departing.instanceId !== context.sourceInstanceId) {
        events.push(`ON_CLOCK_OUT rejected: Snapshot instanceId ${departing.instanceId} does not match sourceInstanceId ${context.sourceInstanceId}.`);
        return { success: false, events, pendingDecisionCreated: false };
      }
      if (departing.ownerId !== context.sourcePlayerId) {
        events.push(`ON_CLOCK_OUT rejected: Snapshot ownerId ${departing.ownerId} does not match sourcePlayerId ${context.sourcePlayerId}.`);
        return { success: false, events, pendingDecisionCreated: false };
      }
      const onBoard = [...activePlayer.battlefield, ...opponent.battlefield].some(
        s => s.card.instanceId === departing.instanceId
      );
      if (onBoard) {
        events.push(`ON_CLOCK_OUT rejected: Character ${departing.instanceId} is still present on battlefield.`);
        return { success: false, events, pendingDecisionCreated: false };
      }
      if (departing.hasTriggeredClockOut) {
        events.push(`ON_CLOCK_OUT rejected: Character ${departing.instanceId} has already triggered ON_CLOCK_OUT.`);
        return { success: false, events, pendingDecisionCreated: false };
      }
      departing.hasTriggeredClockOut = true;

      if (departing.abilities) {
        for (const ab of departing.abilities) {
          if (ab && ab.trigger === 'ON_CLOCK_OUT') {
            candidates.push({ departingCard: departing, ownerId: context.sourcePlayerId, ability: ab });
          }
        }
      }
    } else {
      // Standard battlefield candidates
      for (const slot of activePlayer.battlefield) {
        if (slot.card.abilities && slot.card.abilities.length > 0) {
          for (const ab of slot.card.abilities) {
            if (ab && ab.trigger === trigger) {
              if (trigger === 'ON_PLAY' || trigger === 'ON_DEPLOY' || trigger === 'ON_ATTACK' || trigger === 'ON_DAMAGE_TAKEN') {
                if (slot.card.instanceId === context.sourceInstanceId) {
                  candidates.push({ slot, ownerId: activePlayer.id, ability: ab });
                }
              } else {
                candidates.push({ slot, ownerId: activePlayer.id, ability: ab });
              }
            }
          }
        }
      }

      for (const slot of opponent.battlefield) {
        if (slot.card.abilities && slot.card.abilities.length > 0) {
          for (const ab of slot.card.abilities) {
            if (ab && ab.trigger === trigger && slot.card.instanceId === context.sourceInstanceId) {
              candidates.push({ slot, ownerId: opponent.id, ability: ab });
            }
          }
        }
      }
    }

    let pendingDecisionCreated = false;

    // If an existing decision is already pending, preserve all incoming candidates in FIFO queue
    if (state.pendingDecision !== null) {
      if (!state.pendingTriggerQueue) {
        state.pendingTriggerQueue = [];
      }
      for (const cand of candidates) {
        state.pendingTriggerQueue.push({
          sourceInstanceId: cand.departingCard ? cand.departingCard.instanceId : cand.slot!.card.instanceId,
          sourcePlayerId: cand.ownerId,
          ability: cand.ability,
          trigger,
          departingCard: cand.departingCard,
          executionContext: { depth: localExecContext.depth, budgetCount: localExecContext.budgetCount },
          triggerContext: {
            trigger: context.trigger,
            sourceInstanceId: context.sourceInstanceId,
            sourcePlayerId: context.sourcePlayerId,
            attackerSlot: context.attackerSlot,
            damageAmount: context.damageAmount,
            departingCard: context.departingCard
          }
        });
      }
      return { success: true, events, pendingDecisionCreated: false };
    }

    // Resolve candidates deterministically in FIFO order
    for (let i = 0; i < candidates.length; i++) {
      if ((state.status as string) === 'COMPLETED') break;

      if (localExecContext.budgetCount >= MAX_EXECUTION_BUDGET) {
        events.push(`Execution budget exceeded (MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}). Halting ability execution.`);
        if (!state.pendingTriggerQueue) {
          state.pendingTriggerQueue = [];
        }
        for (let j = i; j < candidates.length; j++) {
          const rem = candidates[j];
          state.pendingTriggerQueue.push({
            sourceInstanceId: rem.departingCard ? rem.departingCard.instanceId : rem.slot!.card.instanceId,
            sourcePlayerId: rem.ownerId,
            ability: rem.ability,
            trigger,
            departingCard: rem.departingCard,
            executionContext: { depth: localExecContext.depth, budgetCount: localExecContext.budgetCount },
            triggerContext: {
              trigger: context.trigger,
              sourceInstanceId: context.sourceInstanceId,
              sourcePlayerId: context.sourcePlayerId,
              attackerSlot: context.attackerSlot,
              damageAmount: context.damageAmount,
              departingCard: context.departingCard
            }
          });
        }
        break;
      }

      const candidate = candidates[i];
      localExecContext.budgetCount += 1;

      const ability = candidate.ability;
      const sourceCardId = candidate.departingCard ? candidate.departingCard.instanceId : candidate.slot!.card.instanceId;
      const sourceCardName = candidate.departingCard ? candidate.departingCard.cardDefId : candidate.slot!.card.cardDefId;

      // Check if manual target selection is required
      if (ability.requiresManualTarget) {
        const legalTargets = getLegalAbilityTargets(state, candidate.ownerId, sourceCardId, ability);
        if (legalTargets.length > 0) {
          state.pendingDecision = {
            type: 'ABILITY_TARGET_SELECTION',
            playerId: candidate.ownerId,
            sourceInstanceId: sourceCardId,
            sourceCardName: sourceCardName,
            abilityId: ability.abilityId,
            effectType: ability.effectType,
            value: ability.primaryValue,
            secondaryValue: ability.secondaryValue,
            targetFilter: ability.targetFilter,
            allowedTargets: legalTargets.map(t => {
              let label = '';
              let isFriendly = true;
              if (t.type === 'CHARACTER') {
                const s = [...activePlayer.battlefield, ...opponent.battlefield].find(slot => slot.card.instanceId === t.characterInstanceId);
                label = s ? `${s.card.cardDefId} (Eff ${s.card.efficiency}/Sta ${s.card.stamina})` : t.characterInstanceId;
                isFriendly = activePlayer.battlefield.some(slot => slot.card.instanceId === t.characterInstanceId);
              } else if (t.type === 'SUPERVISOR') {
                label = `Player ${t.playerId.toUpperCase()} Morale (${state.players[t.playerId].morale})`;
                isFriendly = t.playerId === candidate.ownerId;
              } else if (t.type === 'BOTH_SUPERVISORS') {
                label = `Both Supervisors Morale (P1: ${state.players.p1.morale}, P2: ${state.players.p2.morale})`;
                isFriendly = true;
              } else if (t.type === 'QUEUE_TICKET') {
                label = `Ticket ${t.ticketId}`;
                isFriendly = false;
              }
              return { target: t, label, isFriendly };
            }),
            executionContext: { depth: localExecContext.depth, budgetCount: localExecContext.budgetCount },
            triggerContext: {
              trigger: context.trigger,
              sourceInstanceId: context.sourceInstanceId,
              sourcePlayerId: context.sourcePlayerId,
              attackerSlot: context.attackerSlot,
              damageAmount: context.damageAmount,
              departingCard: context.departingCard
            }
          };
          events.push(`Ability [${ability.name}] triggered. Awaiting target selection from Player ${candidate.ownerId.toUpperCase()}.`);
          pendingDecisionCreated = true;

          // Queue remaining candidates in state.pendingTriggerQueue so they resume after decision resolution
          if (!state.pendingTriggerQueue) {
            state.pendingTriggerQueue = [];
          }
          for (let j = i + 1; j < candidates.length; j++) {
            const rem = candidates[j];
            state.pendingTriggerQueue.push({
              sourceInstanceId: rem.departingCard ? rem.departingCard.instanceId : rem.slot!.card.instanceId,
              sourcePlayerId: rem.ownerId,
              ability: rem.ability,
              trigger,
              departingCard: rem.departingCard,
              executionContext: { depth: localExecContext.depth, budgetCount: localExecContext.budgetCount },
              triggerContext: {
                trigger: context.trigger,
                sourceInstanceId: context.sourceInstanceId,
                sourcePlayerId: context.sourcePlayerId,
                attackerSlot: context.attackerSlot,
                damageAmount: context.damageAmount,
                departingCard: context.departingCard
              }
            });
          }

          break; // Stop loop and await player resolution
        } else {
          events.push(`Ability [${ability.name}] triggered, but no legal targets were available (Fizzled).`);
        }
      } else {
        // Automatic target resolution
        let autoTarget: AbilityTarget = { type: 'NONE' };
        if (ability.targetFilter === 'SELF') {
          autoTarget = { type: 'CHARACTER', characterInstanceId: sourceCardId };
        } else if (ability.targetFilter === 'ALL_FRIENDLY_CHARACTERS') {
          autoTarget = { type: 'ALL_FRIENDLY' };
        } else if (ability.targetFilter === 'ALL_ENEMY_CHARACTERS') {
          autoTarget = { type: 'ALL_ENEMY' };
        } else if (ability.targetFilter === 'ALL_CHARACTERS') {
          autoTarget = { type: 'ALL_CHARACTERS' };
        } else if (ability.targetFilter === 'ALL_FRIENDLY_QUEUE') {
          autoTarget = { type: 'ALL_QUEUE' };
        } else if (ability.targetFilter === 'ENEMY_SUPERVISOR') {
          autoTarget = { type: 'SUPERVISOR', playerId: opponentId };
        } else if (ability.targetFilter === 'FRIENDLY_SUPERVISOR') {
          autoTarget = { type: 'SUPERVISOR', playerId: candidate.ownerId };
        } else if (ability.targetFilter === 'BOTH_SUPERVISORS') {
          autoTarget = { type: 'BOTH_SUPERVISORS' };
        } else if (ability.targetFilter === 'ATTACKER') {
          // Strictly target the exact attacker if available and alive on opponent's battlefield.
          // Never fall back to substituting random opposing characters or supervisors.
          if (context.attackerSlot && context.attackerSlot.card) {
            const oppBattlefield = state.players[opponentId].battlefield;
            const attackerStillAlive = oppBattlefield.some(
              s => s.card.instanceId === context.attackerSlot!.card.instanceId && s.card.stamina > 0
            );
            if (attackerStillAlive) {
              autoTarget = { type: 'CHARACTER', characterInstanceId: context.attackerSlot.card.instanceId };
            } else {
              autoTarget = { type: 'NONE' };
            }
          } else {
            autoTarget = { type: 'NONE' };
          }
        }

        const res = resolveAbilityEffect(state, candidate.ownerId, sourceCardId, ability, autoTarget, localExecContext, context);
        events.push(...res.events);
      }
    }

    return { success: true, events, pendingDecisionCreated };
  } finally {
    localExecContext.depth -= 1;
  }
}
