/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2B: Centralized Combat & Damage Resolution Engine
 * 
 * Implements authoritative combat rules from FINALIZED_COMBAT_RULES.md:
 * 1. Attack Declaration & Targeting laws.
 * 2. Front Desk Guard mandatory targeting & priority enforcement.
 * 3. Infiltration keyword (ignores Front Desk Guard).
 * 4. Rush vs First Responder turn-1 targeting restrictions.
 * 5. Simultaneous damage calculation and assignment.
 * 6. Persistent damage and ablative Stamina Buffer integration.
 * 7. State-Based Action sweep (clocking out to Breakroom at <= 0 Stamina).
 * 8. Direct Morale damage & Rule 1.4 mutual defeat resolution.
 * 9. Interactive pending decision targeting pipeline.
 * 
 * Pure TypeScript — Deterministic and UI-Independent
 */

import {
  GameState,
  PlayerId,
  CharacterSlot,
  CombatTarget,
  PendingCombatTargetDecision,
  PendingCombatTargetOption,
  isOperationSuspended
} from './state.js';
import { evaluateStateBasedActions } from './turn_manager.js';
import { ActionErrorCode } from './actions.js';
import { dispatchTriggers, resetAbilityExecutionBudget } from './abilities.js';

export interface LegalAttackTargets {
  attacker: CharacterSlot;
  canAttackMorale: boolean;
  legalCharacterTargets: CharacterSlot[];
  isRestrictedByGuard: boolean;
}

export interface AttackValidationResult {
  valid: boolean;
  code?: ActionErrorCode;
  message?: string;
}

export interface CombatExecutionResult {
  success: boolean;
  code?: ActionErrorCode;
  error?: string;
  attackerDamageDealt: number;
  defenderDamageDealt: number;
  attackerDied: boolean;
  defenderDied: boolean;
  moraleDamageDealt: number;
  events: string[];
}

/**
 * Calculates all legal attack targets for a ready character slot.
 * Enforces Front Desk Guard priority, Infiltration, Rush, and First Responder rules.
 */
export function getLegalAttackTargets(state: GameState, attackerInstanceId: string): LegalAttackTargets | null {
  const activePlayer = state.players[state.activePlayerId];
  const opponentId: PlayerId = state.activePlayerId === 'p1' ? 'p2' : 'p1';
  const opponent = state.players[opponentId];

  const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === attackerInstanceId);
  if (!attackerSlot || !attackerSlot.canAttack) {
    return null;
  }

  // Active Front Desk Guards on defending board
  const activeGuards = opponent.battlefield.filter(
    s => s.card.isFrontDeskGuard && s.card.stamina > 0
  );

  const hasInfiltration = !!attackerSlot.card.isInfiltration;
  const isDeployTurn = attackerSlot.enteredTurn === state.currentTurn;

  // Turn 1 deploy attack laws:
  // - First Responder can attack anything (characters or Morale)
  // - Rush can attack characters only (cannot attack Morale)
  // - Others cannot attack on deploy turn (summoning sickness)
  let eligibleForMorale = true;
  if (isDeployTurn) {
    if (attackerSlot.card.isFirstResponder) {
      eligibleForMorale = true;
    } else if (attackerSlot.card.isRush) {
      eligibleForMorale = false; // Rush cannot attack Morale on deploy turn
    } else {
      return null; // Cannot attack at all
    }
  }

  if (activeGuards.length > 0 && !hasInfiltration) {
    // Guards present: attacker without Infiltration MUST target one of the guards
    return {
      attacker: attackerSlot,
      canAttackMorale: false,
      legalCharacterTargets: activeGuards,
      isRestrictedByGuard: true
    };
  }

  // No guards OR attacker has Infiltration
  return {
    attacker: attackerSlot,
    canAttackMorale: eligibleForMorale,
    legalCharacterTargets: opponent.battlefield.filter(s => s.card.stamina > 0),
    isRestrictedByGuard: false
  };
}

/**
 * Validates whether a declared attack against a specific target is strictly legal.
 */
export function validateAttack(
  state: GameState,
  attackerInstanceId: string,
  target: CombatTarget
): AttackValidationResult {
  if (state.status !== 'ACTIVE') {
    return {
      valid: false,
      code: 'MATCH_NOT_ACTIVE',
      message: 'Attack rejected: Match is not active.'
    };
  }

  if (state.currentPhase !== 'OPERATIONAL_ACTION') {
    return {
      valid: false,
      code: 'INVALID_PHASE',
      message: `Attack rejected: Attacks may only be declared during OPERATIONAL_ACTION (current: ${state.currentPhase}).`
    };
  }

  if (state.pendingDecision !== null) {
    return {
      valid: false,
      code: 'PENDING_DECISION_REQUIRED',
      message: `Attack rejected: Must resolve pending decision (${state.pendingDecision.type}) first.`
    };
  }

  if (isOperationSuspended(state)) {
    return {
      valid: false,
      code: 'PENDING_DECISION_REQUIRED',
      message: 'Attack rejected: Current game operation is suspended and must complete before performing new actions.'
    };
  }

  const activePlayer = state.players[state.activePlayerId];
  const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === attackerInstanceId);

  if (!attackerSlot) {
    return {
      valid: false,
      code: 'INVALID_TARGET',
      message: 'Attacking character is not on the active player\'s battlefield.'
    };
  }

  if (!attackerSlot.canAttack) {
    return {
      valid: false,
      code: 'ATTACKER_NOT_READY',
      message: `Attacking character ${attackerSlot.card.cardDefId} is exhausted or has summoning sickness.`
    };
  }

  const legalTargets = getLegalAttackTargets(state, attackerInstanceId);
  if (!legalTargets) {
    return {
      valid: false,
      code: 'ATTACKER_NOT_READY',
      message: `Attacking character ${attackerSlot.card.cardDefId} cannot attack this turn.`
    };
  }

  const opponentId: PlayerId = state.activePlayerId === 'p1' ? 'p2' : 'p1';

  if (target.type === 'MORALE') {
    if (target.targetPlayerId !== opponentId) {
      return {
        valid: false,
        code: 'INVALID_TARGET',
        message: 'Cannot attack friendly Morale.'
      };
    }

    if (legalTargets.isRestrictedByGuard) {
      return {
        valid: false,
        code: 'TARGET_PROTECTED_BY_GUARD',
        message: 'Cannot attack Morale directly: Opponent controls active Front Desk Guard(s).'
      };
    }

    if (!legalTargets.canAttackMorale) {
      return {
        valid: false,
        code: 'ATTACKER_CANNOT_ATTACK_MORALE',
        message: `Character ${attackerSlot.card.cardDefId} (Rush) cannot attack Morale on the turn it enters the battlefield.`
      };
    }

    return { valid: true };
  }

  if (target.type === 'CHARACTER') {
    const opponent = state.players[opponentId];
    const targetSlot = opponent.battlefield.find(s => s.card.instanceId === target.characterInstanceId);

    if (!targetSlot || targetSlot.card.stamina <= 0) {
      return {
        valid: false,
        code: 'TARGET_NOT_FOUND',
        message: 'Target character does not exist or has already clocked out.'
      };
    }

    const isLegalTarget = legalTargets.legalCharacterTargets.some(
      s => s.card.instanceId === target.characterInstanceId
    );

    if (!isLegalTarget) {
      if (legalTargets.isRestrictedByGuard) {
        return {
          valid: false,
          code: 'TARGET_PROTECTED_BY_GUARD',
          message: `Cannot target ${targetSlot.card.cardDefId}: Opponent controls Front Desk Guard(s) that must be targeted first.`
        };
      }
      return {
        valid: false,
        code: 'INVALID_TARGET',
        message: `Target character ${targetSlot.card.cardDefId} is not a legal combat target.`
      };
    }

    return { valid: true };
  }

  return {
    valid: false,
    code: 'ILLEGAL_ACTION',
    message: 'Unknown attack target format.'
  };
}

/**
 * Executes an attack atomically:
 * - Calculates simultaneous combat damage.
 * - Applies persistent damage to characters or opponent Morale.
 * - Exhausts the attacking character (`canAttack = false`).
 * - Executes State-Based Actions sweep (clocking out 0-stamina units).
 * - Checks victory/loss conditions.
 */
export function executeAttack(
  state: GameState,
  attackerInstanceId: string,
  target: CombatTarget
): CombatExecutionResult {
  const validation = validateAttack(state, attackerInstanceId, target);
  if (!validation.valid) {
    return {
      success: false,
      code: validation.code,
      error: validation.message,
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: false,
      defenderDied: false,
      moraleDamageDealt: 0,
      events: []
    };
  }

  const events: string[] = [];
  const activePlayer = state.players[state.activePlayerId];
  const opponentId: PlayerId = state.activePlayerId === 'p1' ? 'p2' : 'p1';
  const opponent = state.players[opponentId];

  const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === attackerInstanceId)!;
  const attackerCard = attackerSlot.card;

  // Exhaust attacker
  attackerSlot.canAttack = false;

  resetAbilityExecutionBudget();
  const attackTriggerRes = dispatchTriggers(state, 'ON_ATTACK', {
    trigger: 'ON_ATTACK',
    sourceInstanceId: attackerCard.instanceId,
    sourcePlayerId: activePlayer.id,
    attackerSlot
  });
  events.push(...attackTriggerRes.events);

  if (attackTriggerRes.pendingDecisionCreated || state.pendingDecision !== null || (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0)) {
    state.pendingContinuation = {
      type: 'CONTINUE_COMBAT',
      playerId: activePlayer.id,
      attackerInstanceId,
      target,
      stage: 'AWAITING_ON_ATTACK'
    };
    state.historyLog.push(...events);
    return {
      success: true,
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: false,
      defenderDied: false,
      moraleDamageDealt: 0,
      events
    };
  }

  return completeSuspendedCombat(state, attackerInstanceId, target, events);
}

/**
 * Completes suspended or immediate combat damage application and State-Based Actions sweep.
 */
export function completeSuspendedCombat(
  state: GameState,
  attackerInstanceId: string,
  target: CombatTarget,
  accumulatedEvents: string[] = []
): CombatExecutionResult {
  const continuation = state.pendingContinuation?.type === 'CONTINUE_COMBAT'
    ? state.pendingContinuation
    : null;
  const actingPlayerId = continuation?.playerId ?? state.activePlayerId;
  const activePlayer = state.players[actingPlayerId];
  const opponentId: PlayerId = actingPlayerId === 'p1' ? 'p2' : 'p1';
  const opponent = state.players[opponentId];
  const events = accumulatedEvents;

  // Once simultaneous damage has been applied, resumption must finish queued
  // reactions and the SBA sweep without applying that combat damage a second time.
  if (continuation?.stage === 'AWAITING_POST_DAMAGE_TRIGGERS') {
    evaluateStateBasedActions(state);
    if (state.pendingDecision !== null || (state.pendingTriggerQueue?.length ?? 0) > 0) {
      state.pendingContinuation = continuation;
    } else {
      state.pendingContinuation = null;
    }
    state.historyLog.push(...events);
    return {
      success: true,
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: !activePlayer.battlefield.some(s => s.card.instanceId === attackerInstanceId),
      defenderDied: target.type === 'CHARACTER' && !opponent.battlefield.some(s => s.card.instanceId === target.characterInstanceId),
      moraleDamageDealt: 0,
      events
    };
  }

  const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === attackerInstanceId);
  if (!attackerSlot || attackerSlot.card.stamina <= 0) {
    events.push(`Attacker (${attackerInstanceId}) is no longer able to complete combat.`);
    state.pendingContinuation = null;
    state.historyLog.push(...events);
    return {
      success: true,
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: true,
      defenderDied: false,
      moraleDamageDealt: 0,
      events
    };
  }

  const attackerCard = attackerSlot.card;
  let attackerDamageDealt = 0;
  let defenderDamageDealt = 0;
  let attackerDied = false;
  let defenderDied = false;
  let moraleDamageDealt = 0;

  if (target.type === 'MORALE') {
    moraleDamageDealt = Math.max(0, attackerCard.efficiency);
    opponent.morale = Math.max(0, opponent.morale - moraleDamageDealt);
    events.push(`${attackerCard.cardDefId} (${attackerCard.instanceId}) attacked Player ${opponentId.toUpperCase()}'s Morale directly for ${moraleDamageDealt} damage. (Morale: ${opponent.morale})`);
  } else {
    const defenderSlot = opponent.battlefield.find(s => s.card.instanceId === target.characterInstanceId);
    if (!defenderSlot || defenderSlot.card.stamina <= 0) {
      events.push(`Target character (${target.characterInstanceId}) is no longer on battlefield.`);
    } else {
      const defenderCard = defenderSlot.card;
      attackerDamageDealt = Math.max(0, attackerCard.efficiency);
      defenderDamageDealt = Math.max(0, defenderCard.efficiency);

      events.push(`${attackerCard.cardDefId} (Eff ${attackerDamageDealt}/Sta ${attackerCard.stamina}) engaged ${defenderCard.cardDefId} (Eff ${defenderDamageDealt}/Sta ${defenderCard.stamina}) in combat.`);

      // Combat damage is simultaneous and is committed exactly once before reactions.
      defenderCard.stamina = Math.max(0, defenderCard.stamina - attackerDamageDealt);
      attackerCard.stamina = Math.max(0, attackerCard.stamina - defenderDamageDealt);
      events.push(`Combat damage assigned simultaneously: ${defenderCard.cardDefId} took ${attackerDamageDealt} damage (Remaining Stamina: ${defenderCard.stamina}); ${attackerCard.cardDefId} took ${defenderDamageDealt} damage (Remaining Stamina: ${attackerCard.stamina}).`);

      // Reactions are dispatched in a fixed order. If the first creates a manual
      // decision, later reactions are appended to the shared FIFO trigger queue.
      if (attackerDamageDealt > 0) {
        const dmgRes = dispatchTriggers(state, 'ON_DAMAGE_TAKEN', {
          trigger: 'ON_DAMAGE_TAKEN',
          sourceInstanceId: defenderCard.instanceId,
          sourcePlayerId: opponentId,
          attackerSlot,
          damageAmount: attackerDamageDealt
        });
        events.push(...dmgRes.events);
      }

      if (defenderDamageDealt > 0) {
        const dmgRes = dispatchTriggers(state, 'ON_DAMAGE_TAKEN', {
          trigger: 'ON_DAMAGE_TAKEN',
          sourceInstanceId: attackerCard.instanceId,
          sourcePlayerId: actingPlayerId,
          attackerSlot: defenderSlot,
          damageAmount: defenderDamageDealt
        });
        events.push(...dmgRes.events);
      }

      attackerDied = attackerCard.stamina <= 0;
      defenderDied = defenderCard.stamina <= 0;
    }
  }

  if (state.pendingDecision !== null || (state.pendingTriggerQueue?.length ?? 0) > 0) {
    state.pendingContinuation = {
      type: 'CONTINUE_COMBAT',
      playerId: actingPlayerId,
      attackerInstanceId,
      target,
      stage: 'AWAITING_POST_DAMAGE_TRIGGERS',
      combatDamageApplied: true
    };
  } else {
    // SBA may itself enqueue ON_CLOCK_OUT reactions. Keep the continuation until
    // those reactions and any nested decisions have completed.
    state.pendingContinuation = {
      type: 'CONTINUE_COMBAT',
      playerId: actingPlayerId,
      attackerInstanceId,
      target,
      stage: 'AWAITING_POST_DAMAGE_TRIGGERS',
      combatDamageApplied: true
    };
    evaluateStateBasedActions(state);
    if (state.pendingDecision === null && (state.pendingTriggerQueue?.length ?? 0) === 0) {
      state.pendingContinuation = null;
    }
  }

  state.historyLog.push(...events);
  return {
    success: true,
    attackerDamageDealt,
    defenderDamageDealt,
    attackerDied,
    defenderDied,
    moraleDamageDealt,
    events
  };
}

/**
 * Initiates an interactive combat target selection, creating a PendingCombatTargetDecision.
 * Pauses game engine progression until the active player submits a RESOLVE_COMBAT_TARGET action.
 */
export function initiateAttack(
  state: GameState,
  attackerInstanceId: string
): { success: boolean; code?: ActionErrorCode; error?: string } {
  const activePlayer = state.players[state.activePlayerId];
  const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === attackerInstanceId);

  if (!attackerSlot) {
    return {
      success: false,
      code: 'INVALID_TARGET',
      error: 'Attacker not found on friendly battlefield.'
    };
  }

  if (!attackerSlot.canAttack) {
    return {
      success: false,
      code: 'ATTACKER_NOT_READY',
      error: `Character ${attackerSlot.card.cardDefId} is not ready to attack.`
    };
  }

  const legalTargets = getLegalAttackTargets(state, attackerInstanceId);
  if (!legalTargets) {
    return {
      success: false,
      code: 'ATTACKER_NOT_READY',
      error: `Character ${attackerSlot.card.cardDefId} has no legal attack options this turn.`
    };
  }

  const allowedTargets: PendingCombatTargetOption[] = [];
  const opponentId: PlayerId = state.activePlayerId === 'p1' ? 'p2' : 'p1';

  if (legalTargets.canAttackMorale) {
    allowedTargets.push({
      target: { type: 'MORALE', targetPlayerId: opponentId },
      label: `Opposing Supervisor Morale (${state.players[opponentId].morale} Morale)`,
      isGuard: false
    });
  }

  for (const slot of legalTargets.legalCharacterTargets) {
    allowedTargets.push({
      target: { type: 'CHARACTER', characterInstanceId: slot.card.instanceId },
      label: `${slot.card.cardDefId} (Eff ${slot.card.efficiency}/Sta ${slot.card.stamina})${slot.card.isFrontDeskGuard ? ' [GUARD]' : ''}`,
      isGuard: !!slot.card.isFrontDeskGuard
    });
  }

  if (allowedTargets.length === 0) {
    return {
      success: false,
      code: 'INVALID_TARGET',
      error: 'No valid attack targets available for this character.'
    };
  }

  const pending: PendingCombatTargetDecision = {
    type: 'COMBAT_TARGET_SELECTION',
    playerId: state.activePlayerId,
    attackerInstanceId,
    attackerName: attackerSlot.card.cardDefId,
    attackerEfficiency: attackerSlot.card.efficiency,
    allowedTargets
  };

  state.pendingDecision = pending;
  state.historyLog.push(
    `Player ${state.activePlayerId.toUpperCase()} declared attack with ${attackerSlot.card.cardDefId}. Awaiting target selection.`
  );

  return { success: true };
}

/**
 * Resolves a pending combat target decision and executes the combat action.
 */
export function resolveCombatTarget(
  state: GameState,
  target: CombatTarget
): CombatExecutionResult {
  if (!state.pendingDecision || state.pendingDecision.type !== 'COMBAT_TARGET_SELECTION') {
    return {
      success: false,
      code: 'NO_PENDING_DECISION',
      error: 'No pending combat target selection to resolve.',
      attackerDamageDealt: 0,
      defenderDamageDealt: 0,
      attackerDied: false,
      defenderDied: false,
      moraleDamageDealt: 0,
      events: []
    };
  }

  const attackerId = state.pendingDecision.attackerInstanceId;

  // Clear pending decision before execution
  state.pendingDecision = null;

  return executeAttack(state, attackerId, target);
}
