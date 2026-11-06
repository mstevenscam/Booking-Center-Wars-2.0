/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2A: Centralized Action Validation & Execution Subsystem
 * 
 * Enforces strict mechanical validation rules:
 * - Rejects unauthorized player actions.
 * - Rejects actions outside permitted phase windows (e.g. Master Key locked to Phase 4).
 * - Enforces resource requirements (insufficient Shift).
 * - Enforces zone capacity limits (Hand 8, Battlefield 5, Queue 3).
 * - Rejects actions after match completion.
 * - Returns structured error payloads: { valid: false, code: ErrorCode, message: string }.
 * 
 * Pure TypeScript — Deterministic and UI-Independent
 */

import {
  GameState,
  PlayerId,
  CardInstance,
  CharacterSlot,
  CombatTarget,
  PendingAbilityTargetDecision,
  isOperationSuspended
} from './state.js';
import { calculateQueueCost, QueuedTicket, TriageDecision } from './booking_queue.js';
import { advanceToNextPhase, executeClockOut, evaluateStateBasedActions, completeShiftStartAfterTriggers, completeClockOutCleanup, resolveQueueResolution } from './turn_manager.js';
import { validateAttack, executeAttack, initiateAttack, resolveCombatTarget, completeSuspendedCombat } from './combat.js';
import {
  AbilityTarget,
  CANONICAL_ABILITY_CATALOG,
  dispatchTriggers,
  getLegalAbilityTargets,
  isTargetLegal,
  resetAbilityExecutionBudget,
  resolveAbilityEffect,
  ExecutionContext,
  MAX_EXECUTION_BUDGET,
  MAX_TRIGGER_DEPTH
} from './abilities.js';

export type ActionErrorCode =
  | 'MATCH_NOT_ACTIVE'
  | 'NOT_ACTIVE_PLAYER'
  | 'INVALID_PHASE'
  | 'CARD_NOT_IN_HAND'
  | 'INVALID_OWNERSHIP'
  | 'INSUFFICIENT_SHIFT'
  | 'BATTLEFIELD_FULL'
  | 'QUEUE_FULL'
  | 'INVALID_QUEUE_DURATION'
  | 'SECOND_QUEUE_DISCOUNT_PROHIBITED'
  | 'MASTER_KEY_INVALID_PHASE'
  | 'NO_MASTER_KEYS_REMAINING'
  | 'PENDING_DECISION_REQUIRED'
  | 'NO_PENDING_DECISION'
  | 'HAND_FULL'
  | 'INVALID_TARGET'
  | 'TARGET_NOT_FOUND'
  | 'ATTACKER_NOT_READY'
  | 'ATTACKER_CANNOT_ATTACK_MORALE'
  | 'TARGET_PROTECTED_BY_GUARD'
  | 'ILLEGAL_ACTION';

export type GameEngineAction =
  | {
      type: 'PLAY_CARD' | 'DEPLOY_CARD';
      playerId: PlayerId;
      cardInstanceId: string;
      targetSlotIndex?: number;
    }
  | {
      type: 'QUEUE_CARD';
      playerId: PlayerId;
      cardInstanceId: string;
      queueDuration: number;
    }
  | {
      type: 'USE_MASTER_KEY';
      playerId: PlayerId;
    }
  | {
      type: 'DECLARE_ATTACK';
      playerId: PlayerId;
      attackerInstanceId: string;
      target: CombatTarget;
    }
  | {
      type: 'INITIATE_ATTACK';
      playerId: PlayerId;
      attackerInstanceId: string;
    }
  | {
      type: 'RESOLVE_COMBAT_TARGET';
      playerId: PlayerId;
      target: CombatTarget;
    }
  | {
      type: 'RESOLVE_TRIAGE';
      playerId: PlayerId;
      ticketId: string;
      decision: TriageDecision;
    }
  | {
      type: 'RESOLVE_ABILITY_TARGET';
      playerId: PlayerId;
      target: AbilityTarget;
    }
  | {
      type: 'END_PHASE';
      playerId: PlayerId;
    }
  | {
      type: 'CONCEDE';
      playerId: PlayerId;
    };

export interface ActionValidationResult {
  valid: boolean;
  code?: ActionErrorCode;
  message?: string;
}

export interface ActionExecutionResult {
  success: boolean;
  code?: ActionErrorCode;
  error?: string;
  state: GameState;
  events: string[];
}

/**
 * Pure Validation Function:
 * Asserts whether an action is strictly legal given the current GameState.
 */
export function validateAction(state: GameState, action: GameEngineAction): ActionValidationResult {
  // 1. Check match status
  if (state.status !== 'ACTIVE') {
    return {
      valid: false,
      code: 'MATCH_NOT_ACTIVE',
      message: 'Action rejected: Match is not active.'
    };
  }

  // 2. Concede is valid at any time by either player
  if (action.type === 'CONCEDE') {
    return { valid: true };
  }

  // 3. Pending decision check: Must resolve mandatory decisions before performing other actions
  // 3. Mandatory pending decision locks:
  // If a pending decision exists, reject any action that does not resolve that specific decision
  if (
    state.pendingDecision !== null &&
    action.type !== 'RESOLVE_TRIAGE' &&
    action.type !== 'RESOLVE_COMBAT_TARGET' &&
    action.type !== 'RESOLVE_ABILITY_TARGET'
  ) {
    return {
      valid: false,
      code: 'PENDING_DECISION_REQUIRED',
      message: `Action rejected: Must resolve pending ${state.pendingDecision.type} decision first.`
    };
  }

  // If operation is suspended (pending trigger queue or continuation) even without a visible manual decision, reject new actions
  if (
    state.pendingDecision === null &&
    isOperationSuspended(state)
  ) {
    return {
      valid: false,
      code: 'PENDING_DECISION_REQUIRED',
      message: 'Action rejected: Current game operation is suspended and must complete before performing new actions.'
    };
  }

  // 4. Priority check: Only active player may perform turn actions, except when resolving an off-turn pending decision or conceding
  const isResolvingPendingDecision = state.pendingDecision &&
    (action.type === 'RESOLVE_TRIAGE' || action.type === 'RESOLVE_COMBAT_TARGET' || action.type === 'RESOLVE_ABILITY_TARGET') &&
    action.playerId === state.pendingDecision.playerId;

  if (!isResolvingPendingDecision && action.playerId !== state.activePlayerId) {
    return {
      valid: false,
      code: 'NOT_ACTIVE_PLAYER',
      message: `Action rejected: It is currently Player ${state.activePlayerId.toUpperCase()}'s turn.`
    };
  }

  const activePlayer = state.players[state.activePlayerId];

  switch (action.type) {
    case 'PLAY_CARD':
    case 'DEPLOY_CARD': {
      // Must be in Phase 4 (Operational Action Phase)
      if (state.currentPhase !== 'OPERATIONAL_ACTION') {
        return {
          valid: false,
          code: 'INVALID_PHASE',
          message: `Cards can only be played during OPERATIONAL_ACTION (current phase: ${state.currentPhase}).`
        };
      }

      // Card must exist in active player's hand
      const card = activePlayer.hand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) {
        return {
          valid: false,
          code: 'CARD_NOT_IN_HAND',
          message: `Card instance ${action.cardInstanceId} is not in Player ${action.playerId}'s hand.`
        };
      }

      // Ownership check
      if (card.ownerId !== action.playerId) {
        return {
          valid: false,
          code: 'INVALID_OWNERSHIP',
          message: `Cannot play card owned by opponent.`
        };
      }

      // Shift cost check
      if (activePlayer.currentShift < card.currentCost) {
        return {
          valid: false,
          code: 'INSUFFICIENT_SHIFT',
          message: `Insufficient Shift hours (${activePlayer.currentShift} available, ${card.currentCost} required).`
        };
      }

      // Battlefield capacity check (max 5)
      if (activePlayer.battlefield.length >= 5) {
        return {
          valid: false,
          code: 'BATTLEFIELD_FULL',
          message: 'Battlefield is at maximum capacity (5 characters).'
        };
      }

      return { valid: true };
    }

    case 'QUEUE_CARD': {
      // Must be in Phase 4
      if (state.currentPhase !== 'OPERATIONAL_ACTION') {
        return {
          valid: false,
          code: 'INVALID_PHASE',
          message: `Cards can only be queued during OPERATIONAL_ACTION (current phase: ${state.currentPhase}).`
        };
      }

      // Duration limits: 1 to 4 turns
      if (action.queueDuration < 1 || action.queueDuration > 4) {
        return {
          valid: false,
          code: 'INVALID_QUEUE_DURATION',
          message: `Queue duration must be between 1 and 4 turns (requested ${action.queueDuration}).`
        };
      }

      // Queue capacity limit: max 3 tickets
      if (activePlayer.queue.length >= 3) {
        return {
          valid: false,
          code: 'QUEUE_FULL',
          message: 'Booking Queue is at maximum capacity (3 tickets).'
        };
      }

      const card = activePlayer.hand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) {
        return {
          valid: false,
          code: 'CARD_NOT_IN_HAND',
          message: `Card ${action.cardInstanceId} is not in hand to queue.`
        };
      }

      // Exploit prevention: rerouted cards cannot receive a second queue discount
      if (card.canQueueDiscount === false) {
        return {
          valid: false,
          code: 'SECOND_QUEUE_DISCOUNT_PROHIBITED',
          message: 'A rerouted card cannot receive a second Booking Queue discount.'
        };
      }

      const effectiveCost = calculateQueueCost(card.baseCost, action.queueDuration);
      if (activePlayer.currentShift < effectiveCost) {
        return {
          valid: false,
          code: 'INSUFFICIENT_SHIFT',
          message: `Insufficient Shift to queue (${activePlayer.currentShift} available, ${effectiveCost} required).`
        };
      }

      return { valid: true };
    }

    case 'USE_MASTER_KEY': {
      // MASTER KEY TIMING RESTRICTION: Phase 4 ONLY
      if (state.currentPhase !== 'OPERATIONAL_ACTION') {
        return {
          valid: false,
          code: 'MASTER_KEY_INVALID_PHASE',
          message: `The Master Key may ONLY be activated during OPERATIONAL_ACTION (Phase 4). Current phase: ${state.currentPhase}.`
        };
      }

      if (activePlayer.masterKeyCount <= 0) {
        return {
          valid: false,
          code: 'NO_MASTER_KEYS_REMAINING',
          message: `Player ${action.playerId} has no Master Keys available.`
        };
      }

      return { valid: true };
    }

    case 'END_PHASE': {
      // Valid if in OPERATIONAL_ACTION or advancing manual phase
      return { valid: true };
    }

    case 'RESOLVE_TRIAGE': {
      if (!state.pendingDecision || state.pendingDecision.type !== 'CAPACITY_TRIAGE') {
        return {
          valid: false,
          code: 'ILLEGAL_ACTION',
          message: 'Action rejected: No pending Capacity Triage decision to resolve.'
        };
      }
      if (action.ticketId !== state.pendingDecision.ticketId) {
        return {
          valid: false,
          code: 'ILLEGAL_ACTION',
          message: `Action rejected: Ticket ${action.ticketId} does not match pending triage ticket ${state.pendingDecision.ticketId}.`
        };
      }
      const decision = action.decision;
      if (decision.type === 'RETIRE_EXISTING') {
        if (!decision.boardUnitId) {
          return {
            valid: false,
            code: 'INVALID_TARGET',
            message: 'Must specify a friendly board unit to retire.'
          };
        }
        const unit = activePlayer.battlefield.find(s => s.card.instanceId === decision.boardUnitId);
        if (!unit) {
          return {
            valid: false,
            code: 'INVALID_TARGET',
            message: 'Specified board unit not found on friendly battlefield to retire.'
          };
        }
      } else if (decision.type === 'REROUTE_TO_HAND') {
        if (activePlayer.hand.length >= 8) {
          return {
            valid: false,
            code: 'HAND_FULL',
            message: 'Hand is at maximum capacity (8 cards). Arriving card cannot be rerouted to hand.'
          };
        }
      }
      return { valid: true };
    }

    case 'DECLARE_ATTACK': {
      return validateAttack(state, action.attackerInstanceId, action.target);
    }

    case 'INITIATE_ATTACK': {
      if (state.currentPhase !== 'OPERATIONAL_ACTION') {
        return {
          valid: false,
          code: 'INVALID_PHASE',
          message: `Attacks can only be initiated during OPERATIONAL_ACTION (current phase: ${state.currentPhase}).`
        };
      }
      const attackerSlot = activePlayer.battlefield.find(s => s.card.instanceId === action.attackerInstanceId);
      if (!attackerSlot) {
        return {
          valid: false,
          code: 'INVALID_TARGET',
          message: 'Attacking character is not on active player\'s battlefield.'
        };
      }
      if (!attackerSlot.canAttack) {
        return {
          valid: false,
          code: 'ATTACKER_NOT_READY',
          message: `Character ${attackerSlot.card.cardDefId} is not ready to attack.`
        };
      }
      return { valid: true };
    }

    case 'RESOLVE_COMBAT_TARGET': {
      if (!state.pendingDecision || state.pendingDecision.type !== 'COMBAT_TARGET_SELECTION') {
        return {
          valid: false,
          code: 'NO_PENDING_DECISION',
          message: 'Action rejected: No pending combat target selection to resolve.'
        };
      }
      const isAllowed = state.pendingDecision.allowedTargets.some(t => {
        if (t.target.type !== action.target.type) return false;
        if (t.target.type === 'MORALE' && action.target.type === 'MORALE') {
          return t.target.targetPlayerId === action.target.targetPlayerId;
        }
        if (t.target.type === 'CHARACTER' && action.target.type === 'CHARACTER') {
          return t.target.characterInstanceId === action.target.characterInstanceId;
        }
        return false;
      });
      if (!isAllowed) {
        return {
          valid: false,
          code: 'INVALID_TARGET',
          message: 'Target is not in the list of legally allowed targets.'
        };
      }
      return { valid: true };
    }

    case 'RESOLVE_ABILITY_TARGET': {
      if (!state.pendingDecision || state.pendingDecision.type !== 'ABILITY_TARGET_SELECTION') {
        return {
          valid: false,
          code: 'NO_PENDING_DECISION',
          message: 'No pending ability target selection to resolve.'
        };
      }
      if (action.playerId !== state.pendingDecision.playerId) {
        return {
          valid: false,
          code: 'NOT_ACTIVE_PLAYER',
          message: `Decision must be resolved by Player ${state.pendingDecision.playerId.toUpperCase()}.`
        };
      }
      const isAllowed = isTargetLegal(
        state,
        action.playerId,
        state.pendingDecision.targetFilter,
        action.target,
        state.pendingDecision.sourceInstanceId,
        state.pendingDecision.triggerContext,
        state.pendingDecision.effectType
      );
      if (!isAllowed) {
        return {
          valid: false,
          code: 'INVALID_TARGET',
          message: 'Target is not legally valid for this ability in the current game state.'
        };
      }
      return { valid: true };
    }

    default:
      return {
        valid: false,
        code: 'ILLEGAL_ACTION',
        message: 'Unknown action type.'
      };
  }
}

/**
 * State Transition Reducer:
 * Validates and executes an action against the game state.
 */
export function executeAction(state: GameState, action: GameEngineAction): ActionExecutionResult {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    return {
      success: false,
      code: validation.code,
      error: validation.message,
      state,
      events: []
    };
  }

  const events: string[] = [];

  switch (action.type) {
    case 'CONCEDE': {
      const opponentId: PlayerId = action.playerId === 'p1' ? 'p2' : 'p1';
      state.status = 'COMPLETED';
      state.result = {
        winner: opponentId,
        loser: action.playerId,
        winReason: `Player ${action.playerId.toUpperCase()} conceded.`,
        turnCompleted: state.currentTurn
      };
      events.push(`Player ${action.playerId.toUpperCase()} conceded. Player ${opponentId.toUpperCase()} wins!`);
      state.historyLog.push(...events);
      return { success: true, state, events };
    }

    case 'PLAY_CARD':
    case 'DEPLOY_CARD': {
      const active = state.players[action.playerId];
      const cardIdx = active.hand.findIndex(c => c.instanceId === action.cardInstanceId);
      const card = active.hand.splice(cardIdx, 1)[0];

      // Deduct Shift
      active.currentShift -= card.currentCost;
      card.currentZone = 'BATTLEFIELD';

      const slotId = `slot_${action.targetSlotIndex !== undefined ? action.targetSlotIndex : active.battlefield.length}`;
      const canAttackImmediately = !!(card.isRush || card.isFirstResponder);
      active.battlefield.push({
        slotId,
        card,
        canAttack: canAttackImmediately,
        enteredTurn: state.currentTurn
      });

      events.push(`Player ${action.playerId.toUpperCase()} deployed ${card.cardDefId} for ${card.currentCost} Shift.`);
      if (card.hasOnDeployAbility) {
        events.push(`On Deploy ability triggered for ${card.cardDefId}.`);
      }

      resetAbilityExecutionBudget();

      state.pendingContinuation = {
        type: 'CONTINUE_DEPLOY',
        playerId: action.playerId,
        cardInstanceId: card.instanceId,
        stage: 'AWAITING_ON_PLAY'
      };

      // Dispatch ON_PLAY triggers (only for manually played cards)
      const onPlayResult = dispatchTriggers(state, 'ON_PLAY', {
        trigger: 'ON_PLAY',
        sourceInstanceId: card.instanceId,
        sourcePlayerId: action.playerId
      });
      events.push(...onPlayResult.events);

      if (onPlayResult.pendingDecisionCreated || state.pendingDecision !== null || (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0)) {
        state.historyLog.push(...events);
        return { success: true, state, events };
      }

      // No pending decision on ON_PLAY: advance to ON_DEPLOY
      state.pendingContinuation.stage = 'AWAITING_ON_DEPLOY';
      const onDeployResult = dispatchTriggers(state, 'ON_DEPLOY', {
        trigger: 'ON_DEPLOY',
        sourceInstanceId: card.instanceId,
        sourcePlayerId: action.playerId
      });
      events.push(...onDeployResult.events);

      if (onDeployResult.pendingDecisionCreated || state.pendingDecision !== null || (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0)) {
        state.historyLog.push(...events);
        return { success: true, state, events };
      }

      // Both trigger phases completed without pending decisions or queued triggers
      state.pendingContinuation = null;
      evaluateStateBasedActions(state);
      state.historyLog.push(...events);
      return { success: true, state, events };
    }

    case 'DECLARE_ATTACK': {
      const result = executeAttack(state, action.attackerInstanceId, action.target);
      if (!result.success) {
        return {
          success: false,
          code: result.code,
          error: result.error,
          state,
          events: []
        };
      }
      return { success: true, state, events: result.events };
    }

    case 'INITIATE_ATTACK': {
      const result = initiateAttack(state, action.attackerInstanceId);
      if (!result.success) {
        return {
          success: false,
          code: result.code,
          error: result.error,
          state,
          events: []
        };
      }
      events.push(`Player ${action.playerId.toUpperCase()} initiated attack target selection.`);
      return { success: true, state, events };
    }

    case 'RESOLVE_COMBAT_TARGET': {
      const result = resolveCombatTarget(state, action.target);
      if (!result.success) {
        return {
          success: false,
          code: result.code,
          error: result.error,
          state,
          events: []
        };
      }
      return { success: true, state, events: result.events };
    }

    case 'RESOLVE_ABILITY_TARGET': {
      const pending = state.pendingDecision as PendingAbilityTargetDecision;
      const ability = CANONICAL_ABILITY_CATALOG[pending.abilityId] || {
        abilityId: pending.abilityId,
        name: pending.sourceCardName,
        trigger: 'ON_PLAY',
        targetFilter: pending.targetFilter,
        effectType: pending.effectType,
        primaryValue: pending.value,
        secondaryValue: pending.secondaryValue,
        customDescription: ''
      };

      const execContext: ExecutionContext = pending.executionContext
        ? { depth: pending.executionContext.depth, budgetCount: pending.executionContext.budgetCount }
        : { depth: 0, budgetCount: 0 };

      const triggerCtx = pending.triggerContext;
      state.pendingDecision = null;
      const result = resolveAbilityEffect(state, action.playerId, pending.sourceInstanceId, ability, action.target, execContext, triggerCtx);
      events.push(...result.events);

      if (execContext.depth >= MAX_TRIGGER_DEPTH) {
        events.push(`Trigger cascade limit reached (MAX_TRIGGER_DEPTH = ${MAX_TRIGGER_DEPTH}). Halting further cascades.`);
      }

      // Resume queued triggers from state.pendingTriggerQueue if any exist
      while (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0 && state.pendingDecision === null) {
        const nextCandidate = state.pendingTriggerQueue[0];
        const currentExec: ExecutionContext = nextCandidate.executionContext
          ? { depth: nextCandidate.executionContext.depth, budgetCount: Math.max(nextCandidate.executionContext.budgetCount, execContext.budgetCount) }
          : execContext;

        if (currentExec.depth >= MAX_TRIGGER_DEPTH) {
          events.push(`Trigger cascade limit reached (MAX_TRIGGER_DEPTH = ${MAX_TRIGGER_DEPTH}). Halting further cascades.`);
          break;
        }

        if (currentExec.budgetCount >= MAX_EXECUTION_BUDGET) {
          events.push(`Execution budget exceeded (MAX_EXECUTION_BUDGET = ${MAX_EXECUTION_BUDGET}). Halting ability execution.`);
          break;
        }

        const nextTrigger = state.pendingTriggerQueue.shift()!;
        currentExec.budgetCount += 1;
        execContext.budgetCount = currentExec.budgetCount;

        if (nextTrigger.ability.requiresManualTarget) {
          const legalTargets = getLegalAbilityTargets(state, nextTrigger.sourcePlayerId, nextTrigger.sourceInstanceId, nextTrigger.ability);
          if (legalTargets.length > 0) {
            state.pendingDecision = {
              type: 'ABILITY_TARGET_SELECTION',
              playerId: nextTrigger.sourcePlayerId,
              sourceInstanceId: nextTrigger.sourceInstanceId,
              sourceCardName: nextTrigger.departingCard ? nextTrigger.departingCard.cardDefId : nextTrigger.ability.name,
              abilityId: nextTrigger.ability.abilityId,
              effectType: nextTrigger.ability.effectType,
              value: nextTrigger.ability.primaryValue,
              secondaryValue: nextTrigger.ability.secondaryValue,
              targetFilter: nextTrigger.ability.targetFilter,
              allowedTargets: legalTargets.map(t => {
                let label = '';
                let isFriendly = true;
                if (t.type === 'CHARACTER') {
                  const allSlots = [...state.players.p1.battlefield, ...state.players.p2.battlefield];
                  const s = allSlots.find(slot => slot.card.instanceId === t.characterInstanceId);
                  label = s ? `${s.card.cardDefId} (Eff ${s.card.efficiency}/Sta ${s.card.stamina})` : t.characterInstanceId;
                  isFriendly = state.players[nextTrigger.sourcePlayerId].battlefield.some(slot => slot.card.instanceId === t.characterInstanceId);
                } else if (t.type === 'SUPERVISOR') {
                  label = `Player ${t.playerId.toUpperCase()} Morale (${state.players[t.playerId].morale})`;
                  isFriendly = t.playerId === nextTrigger.sourcePlayerId;
                } else if (t.type === 'BOTH_SUPERVISORS') {
                  label = `Both Supervisors Morale (P1: ${state.players.p1.morale}, P2: ${state.players.p2.morale})`;
                  isFriendly = true;
                } else if (t.type === 'QUEUE_TICKET') {
                  label = `Ticket ${t.ticketId}`;
                  isFriendly = false;
                }
                return { target: t, label, isFriendly };
              }),
              executionContext: { depth: currentExec.depth, budgetCount: currentExec.budgetCount },
              triggerContext: nextTrigger.triggerContext
            };
            events.push(`Ability [${nextTrigger.ability.name}] triggered from queue. Awaiting target selection from Player ${nextTrigger.sourcePlayerId.toUpperCase()}.`);
            break;
          } else {
            events.push(`Ability [${nextTrigger.ability.name}] triggered from queue, but no legal targets were available (Fizzled).`);
          }
        } else {
          let autoTarget: AbilityTarget = { type: 'NONE' };
          const oppId: PlayerId = nextTrigger.sourcePlayerId === 'p1' ? 'p2' : 'p1';
          if (nextTrigger.ability.targetFilter === 'SELF') {
            autoTarget = { type: 'CHARACTER', characterInstanceId: nextTrigger.sourceInstanceId };
          } else if (nextTrigger.ability.targetFilter === 'ALL_FRIENDLY_CHARACTERS') {
            autoTarget = { type: 'ALL_FRIENDLY' };
          } else if (nextTrigger.ability.targetFilter === 'ALL_ENEMY_CHARACTERS') {
            autoTarget = { type: 'ALL_ENEMY' };
          } else if (nextTrigger.ability.targetFilter === 'ALL_CHARACTERS') {
            autoTarget = { type: 'ALL_CHARACTERS' };
          } else if (nextTrigger.ability.targetFilter === 'ALL_FRIENDLY_QUEUE') {
            autoTarget = { type: 'ALL_QUEUE' };
          } else if (nextTrigger.ability.targetFilter === 'ENEMY_SUPERVISOR') {
            autoTarget = { type: 'SUPERVISOR', playerId: oppId };
          } else if (nextTrigger.ability.targetFilter === 'FRIENDLY_SUPERVISOR') {
            autoTarget = { type: 'SUPERVISOR', playerId: nextTrigger.sourcePlayerId };
          } else if (nextTrigger.ability.targetFilter === 'BOTH_SUPERVISORS') {
            autoTarget = { type: 'BOTH_SUPERVISORS' };
          }

          const qRes = resolveAbilityEffect(state, nextTrigger.sourcePlayerId, nextTrigger.sourceInstanceId, nextTrigger.ability, autoTarget, currentExec, nextTrigger.triggerContext);
          events.push(...qRes.events);
          execContext.budgetCount = currentExec.budgetCount;
        }
      }

      // Resume suspended parent game operation if trigger queue has drained and no new decision was created
      if (state.pendingDecision === null && (!state.pendingTriggerQueue || state.pendingTriggerQueue.length === 0) && state.pendingContinuation) {
        const cont = state.pendingContinuation;
        if (cont.type === 'CONTINUE_DEPLOY') {
          if (cont.stage === 'AWAITING_ON_PLAY') {
            cont.stage = 'AWAITING_ON_DEPLOY';
            const onDeployResult = dispatchTriggers(state, 'ON_DEPLOY', {
              trigger: 'ON_DEPLOY',
              sourceInstanceId: cont.cardInstanceId,
              sourcePlayerId: cont.playerId
            }, execContext);
            events.push(...onDeployResult.events);
            if (state.pendingDecision === null && (!state.pendingTriggerQueue || state.pendingTriggerQueue.length === 0)) {
              state.pendingContinuation = null;
              evaluateStateBasedActions(state, execContext);
            }
          } else if (cont.stage === 'AWAITING_ON_DEPLOY') {
            state.pendingContinuation = null;
            evaluateStateBasedActions(state, execContext);
          }
        } else if (cont.type === 'CONTINUE_COMBAT') {
          state.pendingContinuation = null;
          const combatRes = completeSuspendedCombat(
            state,
            cont.attackerInstanceId,
            cont.target,
            events
          );
        } else if (cont.type === 'CONTINUE_CLOCK_OUT') {
          state.pendingContinuation = null;
          completeClockOutCleanup(state, events);
        } else if (cont.type === 'CONTINUE_SHIFT_START') {
          state.pendingContinuation = null;
          const restoredTriage: Map<string, TriageDecision> | undefined = cont.triageDecisions ? new Map<string, TriageDecision>(cont.triageDecisions) : undefined;
          completeShiftStartAfterTriggers(state, events, restoredTriage);
        } else if (cont.type === 'CONTINUE_QUEUE_RESOLUTION') {
          state.pendingContinuation = null;
          const restoredTriage: Map<string, TriageDecision> | undefined = cont.triageDecisions ? new Map<string, TriageDecision>(cont.triageDecisions) : undefined;
          resolveQueueResolution(state, events, cont.countdownDecremented, restoredTriage);
        }
      }

      state.historyLog.push(...events);
      return { success: true, state, events };
    }

    case 'QUEUE_CARD': {
      const active = state.players[action.playerId];
      const cardIdx = active.hand.findIndex(c => c.instanceId === action.cardInstanceId);
      const card = active.hand.splice(cardIdx, 1)[0];

      const effectiveCost = calculateQueueCost(card.baseCost, action.queueDuration);
      active.currentShift -= effectiveCost;
      active.ticketCounter += 1;

      const ticket: QueuedTicket = {
        id: `ticket_${active.id}_${active.ticketCounter}`,
        cardId: card.cardDefId,
        cardName: card.cardDefId,
        baseCost: card.baseCost,
        effectiveCost,
        queuedTurn: state.currentTurn,
        queueDuration: action.queueDuration,
        remainingTurns: action.queueDuration,
        influence: card.influence,
        ownerId: active.id,
        fifoIndex: active.ticketCounter,
        hasOnDeployAbility: card.hasOnDeployAbility,
        abilities: card.abilities ? JSON.parse(JSON.stringify(card.abilities)) : [],
        baseTemplate: card.baseTemplate ? JSON.parse(JSON.stringify(card.baseTemplate)) : undefined
      };

      active.queue.push(ticket);
      events.push(`Player ${action.playerId.toUpperCase()} submitted ${card.cardDefId} to Booking Queue for ${action.queueDuration} turns (Paid ${effectiveCost} Shift).`);

      state.historyLog.push(...events);
      return { success: true, state, events };
    }

    case 'USE_MASTER_KEY': {
      const active = state.players[action.playerId];
      active.masterKeyCount -= 1;
      active.temporaryShift += 1;
      active.currentShift += 1;

      events.push(`Player ${action.playerId.toUpperCase()} activated The Master Key (+1 Temporary Shift).`);
      state.historyLog.push(...events);
      return { success: true, state, events };
    }

    case 'END_PHASE': {
      if (state.currentPhase === 'OPERATIONAL_ACTION') {
        state.currentPhase = 'CLOCK_OUT';
        const clockOutLog = executeClockOut(state);
        events.push(...clockOutLog.events);
      } else {
        advanceToNextPhase(state);
      }
      return { success: true, state, events };
    }

    case 'RESOLVE_TRIAGE': {
      const active = state.players[action.playerId];
      const queueIdx = active.queue.findIndex(t => t.id === action.ticketId);
      if (queueIdx === -1) {
        return { success: false, code: 'ILLEGAL_ACTION', error: 'Ticket not found in player queue.', state, events: [] };
      }
      state.pendingDecision = null;

      const triageMap = new Map<string, TriageDecision>();
      triageMap.set(action.ticketId, action.decision);

      const res = resolveQueueResolution(state, events, true, triageMap);
      return { success: true, state, events: res.events };
    }

    default:
      return { success: false, code: 'ILLEGAL_ACTION', error: 'Unsupported action.', state, events: [] };
  }
}
