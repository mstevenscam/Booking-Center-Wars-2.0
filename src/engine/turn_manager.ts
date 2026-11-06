/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Phase 2A: Turn and Phase Management Subsystem
 * 
 * Implements the 5 canonical phases in strict sequence:
 * Phase 1: Shift Start (Ready board, decrement queue countdown, Capacity Triage)
 * Phase 2: Shift Budgeting (Increment base capacity to min(10, t), promote escrow refund, refill current Shift)
 * Phase 3: Administrative Draw (Draw 1 card, burnout fatigue progression, hand cap 8)
 * Phase 4: Operational Action Phase (Main Phase: card plays, queueing, Master Key, attacks)
 * Phase 5: Clock Out (End Phase: clear temporary Shift, expire buffs, state-based death checks, turn advance)
 * 
 * Pure TypeScript — Deterministic and UI-Independent
 */

import {
  GameState,
  PlayerState,
  PlayerId,
  GamePhase,
  MatchStatus,
  CardInstance,
  CharacterSlot,
  isOperationSuspended
} from './state.js';
import { TriageDecision } from './booking_queue.js';
import { dispatchTriggers, resetAbilityExecutionBudget, ExecutionContext } from './abilities.js';

export interface TurnExecutionLog {
  phase: GamePhase;
  playerId: PlayerId;
  turn: number;
  events: string[];
}

/**
 * State-Based Actions Evaluator:
 * 1. Checks if any supervisor Morale <= 0 -> Match is completed.
 * 2. Checks mutual defeat: if both <= 0 simultaneously, active player loses.
 * 3. Removes battlefield characters whose Stamina <= 0 to the Breakroom.
 */
export function evaluateStateBasedActions(state: GameState, execContext?: ExecutionContext): boolean {
  if (state.status === 'COMPLETED') return true;

  const p1 = state.players.p1;
  const p2 = state.players.p2;

  // 1. Victory / Defeat verification
  if (p1.morale <= 0 && p2.morale <= 0) {
    state.status = 'COMPLETED';
    const loser: PlayerId = state.activePlayerId;
    const winner: PlayerId = loser === 'p1' ? 'p2' : 'p1';
    state.result = {
      winner,
      loser,
      winReason: `Mutual Morale depletion: active turn player (${loser.toUpperCase()}) loses per Rule 1.4.`,
      turnCompleted: state.currentTurn
    };
    state.historyLog.push(`Mutual Morale depletion on turn ${state.currentTurn}: Active player ${loser.toUpperCase()} loses. Player ${winner.toUpperCase()} wins!`);
    return true;
  }

  if (p1.morale <= 0) {
    state.status = 'COMPLETED';
    state.result = {
      winner: 'p2',
      loser: 'p1',
      winReason: 'Player 1 Morale reduced to 0 or lower.',
      turnCompleted: state.currentTurn
    };
    state.historyLog.push(`Player 2 wins on turn ${state.currentTurn} (Player 1 Morale <= 0).`);
    return true;
  }

  if (p2.morale <= 0) {
    state.status = 'COMPLETED';
    state.result = {
      winner: 'p1',
      loser: 'p2',
      winReason: 'Player 2 Morale reduced to 0 or lower.',
      turnCompleted: state.currentTurn
    };
    state.historyLog.push(`Player 1 wins on turn ${state.currentTurn} (Player 2 Morale <= 0).`);
    return true;
  }

  // 2. Unit Clock Out verification (Stamina <= 0)
  for (const player of [p1, p2]) {
    const survivingUnits: CharacterSlot[] = [];
    const deadUnits: { slot: CharacterSlot; owner: PlayerState }[] = [];
    for (const slot of player.battlefield) {
      if (slot.card.stamina <= 0) {
        deadUnits.push({ slot, owner: player });
      } else {
        survivingUnits.push(slot);
      }
    }
    // Update battlefield BEFORE dispatching ON_CLOCK_OUT so dead units are off the battlefield
    player.battlefield = survivingUnits;

    for (const { slot, owner } of deadUnits) {
      slot.card.currentZone = 'BREAKROOM';
      owner.breakroom.push(slot.card);
      state.historyLog.push(`${slot.card.cardDefId} clocked out to Breakroom (0 Stamina).`);

      // Departure event: Trigger ON_CLOCK_OUT strictly once
      if (!slot.card.hasTriggeredClockOut) {
        dispatchTriggers(state, 'ON_CLOCK_OUT', {
          trigger: 'ON_CLOCK_OUT',
          sourceInstanceId: slot.card.instanceId,
          sourcePlayerId: owner.id,
          departingCard: slot.card
        }, execContext);
      }
    }
  }

  return false;
}

/**
 * Executes Phase 1: Shift Start
 */
export function executeShiftStart(
  state: GameState,
  triageDecisions?: Map<string, TriageDecision>
): TurnExecutionLog {
  const active = state.players[state.activePlayerId];
  const events: string[] = [];

  // Step 1: Ready friendly board units
  for (const slot of active.battlefield) {
    slot.canAttack = true;
  }
  events.push(`All friendly battlefield units set to Ready.`);

  // Canonical Phase 1 order: ready units, resolve queue arrivals/triage,
  // then dispatch START_OF_SHIFT abilities. Queue resolution owns the
  // continuation until every arrival and its ON_DEPLOY triggers are complete.
  return resolveQueueResolution(state, events, false, triageDecisions);
}

/**
 * Finalizes Phase 1 after START_OF_SHIFT triggers finish; queue processing has already completed.
 */
export function completeShiftStartAfterTriggers(
  state: GameState,
  accumulatedEvents: string[] = [],
  _triageDecisions?: Map<string, TriageDecision>
): TurnExecutionLog {
  // This continuation is reached only after START_OF_SHIFT abilities finish.
  // Queue countdown and ticket resolution have already completed and must not repeat.
  const events = accumulatedEvents;
  evaluateStateBasedActions(state);
  if (state.status !== 'COMPLETED') {
    state.currentPhase = 'SHIFT_BUDGETING';
  }
  state.historyLog.push(...events);
  return {
    phase: 'SHIFT_START',
    playerId: state.activePlayerId,
    turn: state.currentTurn,
    events
  };
}

/**
 * Resolves the Booking Queue resolution pipeline iteratively.
 * Supports resumption across manual target decisions and execution limits.
 */
export function resolveQueueResolution(
  state: GameState,
  accumulatedEvents: string[] = [],
  countdownDecremented: boolean = false,
  triageDecisions?: Map<string, TriageDecision>
): TurnExecutionLog {
  state.pendingContinuation = null;
  const active = state.players[state.activePlayerId];
  const events: string[] = accumulatedEvents;

  // Step 2: Queue countdown decrement (strictly once per Shift Start)
  if (!countdownDecremented) {
    for (const ticket of active.queue) {
      ticket.remainingTurns = Math.max(0, ticket.remainingTurns - 1);
    }
  }

  // Step 3: Process ready tickets one by one
  while (true) {
    const readyTickets = active.queue.filter(t => t.remainingTurns === 0);
    if (readyTickets.length === 0) {
      break;
    }

    // Sort ready tickets: Tier 1 (turns = 0), Tier 2 (influence desc), Tier 3 (fifo asc), Tier 4 (APNAP)
    readyTickets.sort((a, b) => {
      if (a.influence !== b.influence) return b.influence - a.influence;
      if (a.queuedTurn !== b.queuedTurn) return a.queuedTurn - b.queuedTurn;
      return a.fifoIndex - b.fifoIndex;
    });

    const ticket = readyTickets[0];
    const queueIdx = active.queue.findIndex(t => t.id === ticket.id);
    if (queueIdx === -1) break;

    // Check board space
    if (active.battlefield.length < 5) {
      // Standard deployment: remove ticket from queue first
      active.queue.splice(queueIdx, 1);
      state.instanceCounter = (state.instanceCounter || 0) + 1;
      const deployedCard: CardInstance = {
        instanceId: `inst_${active.id}_${ticket.cardId}_${state.instanceCounter}`,
        cardDefId: ticket.cardId,
        ownerId: active.id,
        currentZone: 'BATTLEFIELD',
        baseCost: ticket.baseCost,
        currentCost: ticket.baseCost,
        canQueueDiscount: true,
        isReroutedFromQueue: false,
        influence: ticket.influence,
        efficiency: ticket.baseTemplate ? ticket.baseTemplate.efficiency : (ticket.efficiency ?? 2),
        stamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.stamina ?? 3),
        maxStamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.maxStamina ?? 3),
        temporaryStaminaBuffer: 0,
        hasOnDeployAbility: !!ticket.hasOnDeployAbility,
        isFrontDeskGuard: ticket.baseTemplate ? ticket.baseTemplate.isFrontDeskGuard : false,
        isRush: ticket.baseTemplate ? ticket.baseTemplate.isRush : false,
        isFirstResponder: ticket.baseTemplate ? ticket.baseTemplate.isFirstResponder : false,
        isInfiltration: ticket.baseTemplate ? ticket.baseTemplate.isInfiltration : false,
        abilities: ticket.abilities ? JSON.parse(JSON.stringify(ticket.abilities)) : [],
        baseTemplate: ticket.baseTemplate ? JSON.parse(JSON.stringify(ticket.baseTemplate)) : undefined
      };

      active.battlefield.push({
        slotId: `slot_${active.battlefield.length}`,
        card: deployedCard,
        canAttack: false, // Summoning sickness
        enteredTurn: state.currentTurn
      });

      events.push(`Ticket ${ticket.id} (${ticket.cardName}) resolved directly onto battlefield.`);
      if (ticket.hasOnDeployAbility) {
        events.push(`On Deploy ability triggered for ${ticket.cardName}.`);
      }
      const deployRes = dispatchTriggers(state, 'ON_DEPLOY', {
        trigger: 'ON_DEPLOY',
        sourceInstanceId: deployedCard.instanceId,
        sourcePlayerId: active.id
      });
      events.push(...deployRes.events);

      if (isOperationSuspended(state)) {
        const serializedTriage = triageDecisions ? Array.from(triageDecisions.entries()) : undefined;
        state.pendingContinuation = {
          type: 'CONTINUE_QUEUE_RESOLUTION',
          playerId: active.id,
          stage: 'RESOLVING_TICKETS',
          countdownDecremented: true,
          triageDecisions: serializedTriage
        };
        state.historyLog.push(...events);
        return {
          phase: 'SHIFT_START',
          playerId: state.activePlayerId,
          turn: state.currentTurn,
          events
        };
      }
    } else {
      // Saturated battlefield (5/5) -> Check if decision was provided
      const decision = triageDecisions?.get(ticket.id);
      if (!decision) {
        // Pause in SHIFT_START and prompt player for mandatory decision
        state.pendingDecision = {
          type: 'CAPACITY_TRIAGE',
          playerId: active.id,
          ticketId: ticket.id,
          cardDefId: ticket.cardId,
          cardName: ticket.cardName,
          effectiveCost: ticket.effectiveCost,
          baseCost: ticket.baseCost,
          influence: ticket.influence,
          hasOnDeployAbility: !!ticket.hasOnDeployAbility,
          allowedOptions: [
            {
              type: 'RETIRE_EXISTING',
              description: 'Retire an existing friendly unit to Breakroom and deploy arriving character.',
              isAvailable: active.battlefield.length > 0,
              unavailableReason: active.battlefield.length > 0 ? null : 'No friendly characters on the Front Counter to retire.'
            },
            {
              type: 'REROUTE_TO_HAND',
              description: 'Reroute arriving character to hand with full escrow refund at base Shift cost.',
              isAvailable: active.hand.length < 8,
              unavailableReason: active.hand.length >= 8 ? 'Hand is at maximum capacity (8 cards).' : null
            },
            {
              type: 'DISCARD_TO_BREAKROOM',
              description: 'Discard arriving character directly to Breakroom with zero refund.',
              isAvailable: true,
              unavailableReason: null
            }
          ]
        };
        events.push(`Battlefield full (5/5). Capacity Triage required for ticket ${ticket.id} (${ticket.cardName}). Pausing in SHIFT_START.`);
        break; // Pause resolution pipeline for player decision
      }

      if (decision.type === 'RETIRE_EXISTING') {
        const boardIdx = active.battlefield.findIndex(s => s.card.instanceId === decision.boardUnitId);
        if (boardIdx >= 0) {
          const retired = active.battlefield.splice(boardIdx, 1)[0].card;
          retired.currentZone = 'BREAKROOM';
          active.breakroom.push(retired);

          // Retirement is a real departure from the battlefield. Resolve its
          // ON_CLOCK_OUT reactions before the arriving ticket is deployed.
          const retireRes = dispatchTriggers(state, 'ON_CLOCK_OUT', {
            trigger: 'ON_CLOCK_OUT',
            sourceInstanceId: retired.instanceId,
            sourcePlayerId: active.id,
            departingCard: retired
          });
          events.push(...retireRes.events);

          if (isOperationSuspended(state)) {
            const serializedTriage = triageDecisions ? Array.from(triageDecisions.entries()) : undefined;
            state.pendingContinuation = {
              type: 'CONTINUE_QUEUE_RESOLUTION',
              playerId: active.id,
              stage: 'RESOLVING_TICKETS',
              countdownDecremented: true,
              triageDecisions: serializedTriage
            };
            state.historyLog.push(...events);
            return {
              phase: 'SHIFT_START',
              playerId: state.activePlayerId,
              turn: state.currentTurn,
              events
            };
          }

          // A retirement trigger may end the match. Do not deploy the queued
          // arrival or process further tickets after a completed match.
          if (state.status === 'COMPLETED') {
            state.historyLog.push(...events);
            return {
              phase: 'SHIFT_START',
              playerId: state.activePlayerId,
              turn: state.currentTurn,
              events
            };
          }

          active.queue.splice(queueIdx, 1);
          state.instanceCounter = (state.instanceCounter || 0) + 1;
          const deployedCard: CardInstance = {
            instanceId: `inst_${active.id}_${ticket.cardId}_${state.instanceCounter}`,
            cardDefId: ticket.cardId,
            ownerId: active.id,
            currentZone: 'BATTLEFIELD',
            baseCost: ticket.baseCost,
            currentCost: ticket.baseCost,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: ticket.influence,
            efficiency: ticket.baseTemplate ? ticket.baseTemplate.efficiency : (ticket.efficiency ?? 2),
            stamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.stamina ?? 3),
            maxStamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.maxStamina ?? 3),
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: !!ticket.hasOnDeployAbility,
            isFrontDeskGuard: ticket.baseTemplate ? ticket.baseTemplate.isFrontDeskGuard : false,
            isRush: ticket.baseTemplate ? ticket.baseTemplate.isRush : false,
            isFirstResponder: ticket.baseTemplate ? ticket.baseTemplate.isFirstResponder : false,
            isInfiltration: ticket.baseTemplate ? ticket.baseTemplate.isInfiltration : false,
            abilities: ticket.abilities ? JSON.parse(JSON.stringify(ticket.abilities)) : [],
            baseTemplate: ticket.baseTemplate ? JSON.parse(JSON.stringify(ticket.baseTemplate)) : undefined
          };

          active.battlefield.push({
            slotId: `slot_${active.battlefield.length}`,
            card: deployedCard,
            canAttack: false,
            enteredTurn: state.currentTurn
          });
          events.push(`Triage Option 1: Retired ${retired.cardDefId}, deployed arriving ${ticket.cardName}.`);
          if (ticket.hasOnDeployAbility) {
            events.push(`On Deploy ability triggered for ${ticket.cardName}.`);
          }
          const triageDeployRes = dispatchTriggers(state, 'ON_DEPLOY', {
            trigger: 'ON_DEPLOY',
            sourceInstanceId: deployedCard.instanceId,
            sourcePlayerId: active.id
          });
          events.push(...triageDeployRes.events);

          if (isOperationSuspended(state)) {
            const serializedTriage = triageDecisions ? Array.from(triageDecisions.entries()) : undefined;
            state.pendingContinuation = {
              type: 'CONTINUE_QUEUE_RESOLUTION',
              playerId: active.id,
              stage: 'RESOLVING_TICKETS',
              countdownDecremented: true,
              triageDecisions: serializedTriage
            };
            state.historyLog.push(...events);
            return {
              phase: 'SHIFT_START',
              playerId: state.activePlayerId,
              turn: state.currentTurn,
              events
            };
          }
        }
      } else if (decision.type === 'REROUTE_TO_HAND') {
        if (active.hand.length < 8) {
          active.queue.splice(queueIdx, 1);
          const refund = ticket.effectiveCost;
          active.shiftHours = (active.shiftHours || 0) + refund; // compatibility
          active.pendingEscrowRefund = (active.pendingEscrowRefund || 0) + refund;
          active.currentShift += refund;

          state.instanceCounter = (state.instanceCounter || 0) + 1;
          const reroutedCard: CardInstance = {
            instanceId: `inst_${active.id}_${ticket.cardId}_${state.instanceCounter}`,
            cardDefId: ticket.cardId,
            ownerId: active.id,
            currentZone: 'HAND',
            baseCost: ticket.baseCost,
            currentCost: ticket.baseCost, // Model A: must pay full base cost
            canQueueDiscount: false,      // Prohibit stacking discount
            isReroutedFromQueue: true,
            influence: ticket.influence,
            efficiency: ticket.baseTemplate ? ticket.baseTemplate.efficiency : (ticket.efficiency ?? 2),
            stamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.stamina ?? 3),
            maxStamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.maxStamina ?? 3),
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: !!ticket.hasOnDeployAbility,
            isFrontDeskGuard: ticket.baseTemplate ? ticket.baseTemplate.isFrontDeskGuard : false,
            isRush: ticket.baseTemplate ? ticket.baseTemplate.isRush : false,
            isFirstResponder: ticket.baseTemplate ? ticket.baseTemplate.isFirstResponder : false,
            isInfiltration: ticket.baseTemplate ? ticket.baseTemplate.isInfiltration : false,
            abilities: ticket.abilities ? JSON.parse(JSON.stringify(ticket.abilities)) : [],
            baseTemplate: ticket.baseTemplate ? JSON.parse(JSON.stringify(ticket.baseTemplate)) : undefined
          };
          active.hand.push(reroutedCard);
          events.push(`Triage Option 2: Rerouted ${ticket.cardName} to hand at base cost ${ticket.baseCost}. Refunded ${refund} Shift.`);
        } else {
          // Hand cap exceeded: forced discard
          active.queue.splice(queueIdx, 1);
          state.instanceCounter = (state.instanceCounter || 0) + 1;
          const discardedCard: CardInstance = {
            instanceId: `inst_${active.id}_${ticket.cardId}_${state.instanceCounter}`,
            cardDefId: ticket.cardId,
            ownerId: active.id,
            currentZone: 'BREAKROOM',
            baseCost: ticket.baseCost,
            currentCost: ticket.baseCost,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: ticket.influence,
            efficiency: ticket.baseTemplate ? ticket.baseTemplate.efficiency : (ticket.efficiency ?? 2),
            stamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.stamina ?? 3),
            maxStamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.maxStamina ?? 3),
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: !!ticket.hasOnDeployAbility,
            isFrontDeskGuard: ticket.baseTemplate ? ticket.baseTemplate.isFrontDeskGuard : false,
            isRush: ticket.baseTemplate ? ticket.baseTemplate.isRush : false,
            isFirstResponder: ticket.baseTemplate ? ticket.baseTemplate.isFirstResponder : false,
            isInfiltration: ticket.baseTemplate ? ticket.baseTemplate.isInfiltration : false,
            abilities: ticket.abilities ? JSON.parse(JSON.stringify(ticket.abilities)) : [],
            baseTemplate: ticket.baseTemplate ? JSON.parse(JSON.stringify(ticket.baseTemplate)) : undefined
          };
          active.breakroom.push(discardedCard);
          events.push(`Triage Option 2 failed (hand cap 8). Arriving ticket discarded.`);
        }
      } else {
        // Option 3: Discard
        active.queue.splice(queueIdx, 1);
        state.instanceCounter = (state.instanceCounter || 0) + 1;
        const discardedCard: CardInstance = {
          instanceId: `inst_${active.id}_${ticket.cardId}_${state.instanceCounter}`,
          cardDefId: ticket.cardId,
          ownerId: active.id,
          currentZone: 'BREAKROOM',
          baseCost: ticket.baseCost,
          currentCost: ticket.baseCost,
          canQueueDiscount: true,
          isReroutedFromQueue: false,
          influence: ticket.influence,
          efficiency: ticket.baseTemplate ? ticket.baseTemplate.efficiency : (ticket.efficiency ?? 2),
          stamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.stamina ?? 3),
          maxStamina: ticket.baseTemplate ? ticket.baseTemplate.stamina : (ticket.maxStamina ?? 3),
          temporaryStaminaBuffer: 0,
          hasOnDeployAbility: !!ticket.hasOnDeployAbility,
          isFrontDeskGuard: ticket.baseTemplate ? ticket.baseTemplate.isFrontDeskGuard : false,
          isRush: ticket.baseTemplate ? ticket.baseTemplate.isRush : false,
          isFirstResponder: ticket.baseTemplate ? ticket.baseTemplate.isFirstResponder : false,
          isInfiltration: ticket.baseTemplate ? ticket.baseTemplate.isInfiltration : false,
          abilities: ticket.abilities ? JSON.parse(JSON.stringify(ticket.abilities)) : [],
          baseTemplate: ticket.baseTemplate ? JSON.parse(JSON.stringify(ticket.baseTemplate)) : undefined
        };
        active.breakroom.push(discardedCard);
        events.push(`Triage Option 3: Ticket ${ticket.cardName} discarded to Breakroom.`);
      }
    }
  }

  // Queue processing (including every ON_DEPLOY reaction) is complete.
  // START_OF_SHIFT triggers are deliberately dispatched afterwards, matching
  // the canonical five-phase rules sequence.
  if (state.pendingDecision === null && (!state.pendingTriggerQueue || state.pendingTriggerQueue.length === 0)) {
    resetAbilityExecutionBudget();
    const startRes = dispatchTriggers(state, 'START_OF_SHIFT', {
      trigger: 'START_OF_SHIFT',
      sourceInstanceId: '',
      sourcePlayerId: active.id
    });
    events.push(...startRes.events);

    if (startRes.pendingDecisionCreated || state.pendingDecision !== null || (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0)) {
      state.pendingContinuation = {
        type: 'CONTINUE_SHIFT_START',
        playerId: active.id,
        stage: 'AWAITING_START_OF_SHIFT'
      };
      state.historyLog.push(...events);
      return {
        phase: 'SHIFT_START',
        playerId: state.activePlayerId,
        turn: state.currentTurn,
        events
      };
    }
  }

  evaluateStateBasedActions(state);
  if (state.status !== 'COMPLETED' && !isOperationSuspended(state)) {
    // Also handles completion through RESOLVE_TRIAGE or a resumed queue trigger,
    // where advanceToNextPhase is not on the current call stack.
    state.currentPhase = 'SHIFT_BUDGETING';
  }
  state.historyLog.push(...events);

  return {
    phase: 'SHIFT_START',
    playerId: state.activePlayerId,
    turn: state.currentTurn,
    events
  };
}

/**
 * Executes Phase 2: Shift Budgeting
 */
export function executeShiftBudgeting(state: GameState): TurnExecutionLog {
  const active = state.players[state.activePlayerId];
  const events: string[] = [];

  // Step 1: Increment Maximum Shift Capacity (+1 up to 10)
  active.baseShiftCapacity = Math.min(10, active.baseShiftCapacity + 1);
  events.push(`Base Shift Capacity increased to ${active.baseShiftCapacity}.`);

  // Step 2: Promote Phase 1 escrow refund to active temporary Shift
  const escrowRefund = active.pendingEscrowRefund || 0;
  active.temporaryShift = (active.temporaryShift || 0) + escrowRefund;
  active.pendingEscrowRefund = 0;

  // Step 3: Refill spendable Shift to base capacity + active temporary Shift
  active.currentShift = active.baseShiftCapacity + active.temporaryShift;
  events.push(`Spendable Shift refilled to ${active.currentShift} (${active.baseShiftCapacity} base + ${active.temporaryShift} temporary).`);

  evaluateStateBasedActions(state);
  state.historyLog.push(...events);

  return {
    phase: 'SHIFT_BUDGETING',
    playerId: state.activePlayerId,
    turn: state.currentTurn,
    events
  };
}

/**
 * Executes Phase 3: Administrative Draw
 */
export function executeAdministrativeDraw(state: GameState): TurnExecutionLog {
  const active = state.players[state.activePlayerId];
  const events: string[] = [];

  if (active.deck.length === 0) {
    // Burnout Fatigue Progression: 1, 2, 3, 4...
    active.fatigueCount += 1;
    active.morale -= active.fatigueCount;
    events.push(`Burnout Fatigue! Deck empty. Active player took ${active.fatigueCount} fatigue damage (Morale: ${active.morale}).`);
  } else {
    const drawn = active.deck.shift()!;
    if (active.hand.length < 8) {
      drawn.currentZone = 'HAND';
      active.hand.push(drawn);
      events.push(`Drew card ${drawn.cardDefId} into hand (Hand size: ${active.hand.length}).`);
    } else {
      // Hand cap exceeded: burned directly to Breakroom
      drawn.currentZone = 'BREAKROOM';
      active.breakroom.push(drawn);
      events.push(`Hand full (8 cards). Card ${drawn.cardDefId} burned to Breakroom.`);
    }
  }

  evaluateStateBasedActions(state);
  state.historyLog.push(...events);

  return {
    phase: 'ADMINISTRATIVE_DRAW',
    playerId: state.activePlayerId,
    turn: state.currentTurn,
    events
  };
}

/**
 * Executes Phase 5: Clock Out (End Phase)
 */
export function executeClockOut(state: GameState): TurnExecutionLog {
  const active = state.players[state.activePlayerId];
  const events: string[] = [];

  // Dispatch END_OF_SHIFT triggers for friendly battlefield units once
  resetAbilityExecutionBudget();
  const endRes = dispatchTriggers(state, 'END_OF_SHIFT', {
    trigger: 'END_OF_SHIFT',
    sourceInstanceId: '',
    sourcePlayerId: active.id
  });
  events.push(...endRes.events);

  if (endRes.pendingDecisionCreated || state.pendingDecision !== null || (state.pendingTriggerQueue && state.pendingTriggerQueue.length > 0)) {
    state.pendingContinuation = {
      type: 'CONTINUE_CLOCK_OUT',
      playerId: active.id,
      stage: 'AWAITING_END_OF_SHIFT'
    };
    state.historyLog.push(...events);
    return {
      phase: 'CLOCK_OUT',
      playerId: active.id,
      turn: state.currentTurn,
      events
    };
  }

  return completeClockOutCleanup(state, events);
}

/**
 * Completes Phase 5 buffer expiration, Shift clearing, SBA sweep, and turn advance after END_OF_SHIFT triggers finish.
 */
export function completeClockOutCleanup(
  state: GameState,
  accumulatedEvents: string[] = []
): TurnExecutionLog {
  state.pendingContinuation = null;
  const active = state.players[state.activePlayerId];
  const events: string[] = accumulatedEvents;

  // Option A Temporary Stamina & Efficiency Buffer turn-end expiration & clamping
  for (const player of [state.players.p1, state.players.p2]) {
    for (const slot of player.battlefield) {
      if (slot.card.temporaryStaminaBuffer && slot.card.temporaryStaminaBuffer > 0) {
        slot.card.maxStamina = Math.max(1, slot.card.maxStamina - slot.card.temporaryStaminaBuffer);
        slot.card.stamina = Math.min(slot.card.stamina, slot.card.maxStamina);
        slot.card.temporaryStaminaBuffer = 0;
        events.push(`Temporary stamina buff expired on ${slot.card.cardDefId}. Clamped to ${slot.card.stamina}/${slot.card.maxStamina}.`);
      }
      if (slot.card.temporaryEfficiencyBuffer && slot.card.temporaryEfficiencyBuffer > 0) {
        slot.card.efficiency = Math.max(0, slot.card.efficiency - slot.card.temporaryEfficiencyBuffer);
        slot.card.temporaryEfficiencyBuffer = 0;
        events.push(`Temporary power buff expired on ${slot.card.cardDefId}. Efficiency reset to ${slot.card.efficiency}.`);
      }
    }
  }

  // Clear unspent temporary Shift
  active.temporaryShift = 0;
  active.pendingEscrowRefund = 0;
  active.currentShift = 0; // Cleared until next turn's Phase 2 refill
  events.push(`Shift concluded. Unspent temporary and regular Shift expired.`);

  // Evaluate state-based actions
  evaluateStateBasedActions(state);

  if (state.status !== 'COMPLETED') {
    // Advance to next player
    if (state.activePlayerId === 'p1') {
      state.activePlayerId = 'p2';
      events.push(`Turn passed to Player 2.`);
    } else {
      state.activePlayerId = 'p1';
      state.currentTurn += 1;
      events.push(`Turn passed to Player 1. Round advanced to turn ${state.currentTurn}.`);
    }
    state.currentPhase = 'SHIFT_START';
  }

  state.historyLog.push(...events);

  return {
    phase: 'CLOCK_OUT',
    playerId: active.id,
    turn: state.currentTurn,
    events
  };
}

/**
 * Canonical Phase Progression State Machine:
 * Strictly transitions through:
 * SHIFT_START -> SHIFT_BUDGETING -> ADMINISTRATIVE_DRAW -> OPERATIONAL_ACTION -> CLOCK_OUT -> (Next Player SHIFT_START)
 */
function isMatchCompleted(state: GameState): boolean {
  return (state.status as MatchStatus) === 'COMPLETED';
}

export function advanceToNextPhase(
  state: GameState,
  triageDecisions?: Map<string, TriageDecision>
): { success: boolean; newPhase: GamePhase; error?: string } {
  if (isMatchCompleted(state)) {
    return { success: false, newPhase: state.currentPhase, error: 'Match is already completed.' };
  }

  if (state.pendingDecision !== null) {
    return {
      success: false,
      newPhase: state.currentPhase,
      error: 'Cannot advance phase: Mandatory Capacity Triage decision is pending.'
    };
  }

  if (isOperationSuspended(state)) {
    return {
      success: false,
      newPhase: state.currentPhase,
      error: 'Cannot advance phase: Current operation is suspended.'
    };
  }

  switch (state.currentPhase) {
    case 'SHIFT_START':
      executeShiftStart(state, triageDecisions);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'SHIFT_START' };
      if (isOperationSuspended(state)) {
        return { success: true, newPhase: 'SHIFT_START' };
      }
      state.currentPhase = 'SHIFT_BUDGETING';
      executeShiftBudgeting(state);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'SHIFT_BUDGETING' };
      state.currentPhase = 'ADMINISTRATIVE_DRAW';
      executeAdministrativeDraw(state);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'ADMINISTRATIVE_DRAW' };
      state.currentPhase = 'OPERATIONAL_ACTION';
      return { success: true, newPhase: 'OPERATIONAL_ACTION' };

    case 'SHIFT_BUDGETING':
      state.currentPhase = 'ADMINISTRATIVE_DRAW';
      executeAdministrativeDraw(state);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'ADMINISTRATIVE_DRAW' };
      state.currentPhase = 'OPERATIONAL_ACTION';
      return { success: true, newPhase: 'OPERATIONAL_ACTION' };

    case 'ADMINISTRATIVE_DRAW':
      state.currentPhase = 'OPERATIONAL_ACTION';
      return { success: true, newPhase: 'OPERATIONAL_ACTION' };

    case 'OPERATIONAL_ACTION':
      state.currentPhase = 'CLOCK_OUT';
      executeClockOut(state);
      return { success: true, newPhase: state.currentPhase };

    case 'CLOCK_OUT':
      // From Clock Out, begins the next player's Shift Start
      executeShiftStart(state, triageDecisions);
      if (isMatchCompleted(state)) return { success: true, newPhase: state.currentPhase };
      if (isOperationSuspended(state)) {
        return { success: true, newPhase: 'SHIFT_START' };
      }
      state.currentPhase = 'SHIFT_BUDGETING';
      executeShiftBudgeting(state);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'SHIFT_BUDGETING' };
      state.currentPhase = 'ADMINISTRATIVE_DRAW';
      executeAdministrativeDraw(state);
      if (isMatchCompleted(state)) return { success: true, newPhase: 'ADMINISTRATIVE_DRAW' };
      state.currentPhase = 'OPERATIONAL_ACTION';
      return { success: true, newPhase: 'OPERATIONAL_ACTION' };

    default:
      return { success: false, newPhase: state.currentPhase, error: 'Unknown phase.' };
  }
}
