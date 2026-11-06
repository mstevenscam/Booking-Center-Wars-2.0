/**
 * BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
 * Canonical Booking Queue & Capacity Triage Engine
 * Phase 1B Rules Lock Specification
 * 
 * Implements:
 * 1. Booking Queue lifecycle and ticket management (Max 3 tickets/player, 1-4 turns).
 * 2. 4-tier resolution tie-breaking hierarchy (Expiration -> Highest Influence -> FIFO -> Active Player Priority).
 * 3. Corrected Capacity Triage Protocol (exploit-free):
 *    - Option 1 (Retire Board Unit): Retires a board unit, deploys arriving card, triggers On Deploy.
 *    - Option 2 (Reroute to Hand): If Hand < 8, returns card to hand.
 *      CRITICAL BALANCE LOCK: The card retains its calculated effective Shift cost and MUST be paid
 *      normally when subsequently played from hand. Cannot receive a second queue discount.
 *      Rerouting does NOT trigger On Deploy or count as a card play.
 *    - Option 3 (Discard to Breakroom): If Hand = 8 or player chooses, discards arriving card.
 * 
 * Pure TypeScript — Zero External Dependencies
 */

export interface QueuedTicket {
  id: string;
  cardId: string;
  cardName: string;
  baseCost: number;
  effectiveCost: number; // The calculated Shift cost paid when queued
  queuedTurn: number;
  queueDuration: number;
  remainingTurns: number;
  influence: number;
  ownerId: 'p1' | 'p2';
  fifoIndex: number; // Order in which ticket was entered on that turn
  hasOnDeployAbility?: boolean;
  abilities?: any[];
  baseTemplate?: any;
  efficiency?: number;
  stamina?: number;
  maxStamina?: number;
}

export interface HandCard {
  cardId: string;
  cardName: string;
  baseCost: number;
  shiftCostToPlay: number; // Shift cost required to play from hand
  influence: number;
  canQueueDiscount: boolean; // False if rerouted from queue to prevent stacking discounts
  isReroutedFromQueue: boolean;
  hasOnDeployAbility?: boolean;
}

export interface BoardCharacter {
  id: string;
  cardId: string;
  cardName: string;
  influence: number;
  efficiency: number;
  stamina: number;
}

export interface PlayerQueueState {
  playerId: 'p1' | 'p2';
  maxBoardCapacity: number; // Standard: 5
  maxHandCapacity: number;  // Standard: 8
  maxQueueCapacity: number; // Standard: 3
  queue: QueuedTicket[];
  hand: HandCard[];
  board: BoardCharacter[];
  breakroom: string[]; // Card IDs sent to discard
  shiftHours: number;
  baseShiftCapacity: number;
  temporaryShift: number;
  pendingEscrowRefund: number;
  deck: string[];
  ticketCounter: number;
}

export type TriageDecision =
  | { type: 'RETIRE_EXISTING'; boardUnitId: string }
  | { type: 'REROUTE_TO_HAND' }
  | { type: 'DISCARD_TO_BREAKROOM' };

export interface TriageResult {
  success: boolean;
  actionTaken: 'DEPLOYED_AFTER_RETIRE' | 'REROUTED_TO_HAND' | 'DISCARDED_TO_BREAKROOM';
  deployedCardId?: string;
  refundedShift?: number;
  triggeredOnDeploy: boolean;
  error?: string;
}

export interface Phase1Result {
  ticketsTicked: number;
  readyTickets: QueuedTicket[];
  deployedTickets: string[];
  triageResults: TriageResult[];
  refundedShiftTotal: number;
}

export interface Phase2Result {
  turn: number;
  baseCapacity: number;
  temporaryShift: number;
  totalShiftHours: number;
}

export interface Phase3Result {
  drawnCardId?: string;
  handSize: number;
  burnedCardId?: string;
}

export interface Phase5Result {
  clearedTemporaryShift: number;
  unspentShiftHoursExpired: number;
  finalShiftHours: number;
}

/**
 * Creates a fresh player queue and board state
 */
export function createPlayerQueueState(playerId: 'p1' | 'p2'): PlayerQueueState {
  return {
    playerId,
    maxBoardCapacity: 5,
    maxHandCapacity: 8,
    maxQueueCapacity: 3,
    queue: [],
    hand: [],
    board: [],
    breakroom: [],
    shiftHours: 1,
    baseShiftCapacity: 1,
    temporaryShift: 0,
    pendingEscrowRefund: 0,
    deck: [],
    ticketCounter: 0
  };
}

/**
 * Calculates effective queue discount cost
 * Floor of 1 Shift: EffectiveQueueCost = max(1, round(ImmediateCost - (QueueTurns * 0.75)))
 */
export function calculateQueueCost(baseCost: number, queueTurns: number): number {
  if (queueTurns <= 0) return baseCost;
  const discount = queueTurns * 0.75;
  return Math.max(1, Math.round(baseCost - discount));
}

/**
 * Attempts to queue a card from hand
 */
export function queueCard(
  state: PlayerQueueState,
  card: { cardId: string; cardName: string; baseCost: number; influence: number; hasOnDeployAbility?: boolean; canQueueDiscount?: boolean },
  queueDuration: number,
  currentTurn: number
): { success: boolean; effectiveCost?: number; error?: string } {
  if (state.queue.length >= state.maxQueueCapacity) {
    return { success: false, error: 'Queue is at maximum capacity (3 tickets).' };
  }
  if (queueDuration < 1 || queueDuration > 4) {
    return { success: false, error: 'Queue duration must be between 1 and 4 turns.' };
  }
  if (card.canQueueDiscount === false) {
    return { success: false, error: 'A rerouted card cannot receive a second queue discount.' };
  }

  const effectiveCost = calculateQueueCost(card.baseCost, queueDuration);
  if (state.shiftHours < effectiveCost) {
    return { success: false, error: `Insufficient Shift hours (${state.shiftHours} available, ${effectiveCost} needed).` };
  }

  state.shiftHours -= effectiveCost;
  state.ticketCounter++;

  const ticket: QueuedTicket = {
    id: `ticket_${state.ticketCounter}`,
    cardId: card.cardId,
    cardName: card.cardName,
    baseCost: card.baseCost,
    effectiveCost,
    queuedTurn: currentTurn,
    queueDuration,
    remainingTurns: queueDuration,
    influence: card.influence,
    ownerId: state.playerId,
    fifoIndex: state.ticketCounter,
    hasOnDeployAbility: card.hasOnDeployAbility
  };

  state.queue.push(ticket);
  return { success: true, effectiveCost };
}

/**
 * Decrements remaining turns for all tickets in a player's queue at Shift Start
 */
export function tickQueueCountdown(state: PlayerQueueState): QueuedTicket[] {
  for (const ticket of state.queue) {
    ticket.remainingTurns = Math.max(0, ticket.remainingTurns - 1);
  }
  return state.queue.filter(t => t.remainingTurns === 0);
}

/**
 * 4-Tier Hierarchical Resolution Tie-Breaking Algorithm
 * Sorts tickets scheduled to resolve on the same step:
 * 1. Expiration (remainingTurns === 0)
 * 2. Highest Influence First (4 > 3 > 2 > 1)
 * 3. FIFO Queue Timestamp (queuedTurn, then fifoIndex)
 * 4. Active Player Priority (APNAP: Active player resolves first if cross-player resolution)
 */
export function sortResolvingTickets(
  tickets: QueuedTicket[],
  activePlayerId: 'p1' | 'p2'
): QueuedTicket[] {
  return [...tickets].sort((a, b) => {
    // Tier 1: Turn Expiration
    if (a.remainingTurns !== b.remainingTurns) {
      return a.remainingTurns - b.remainingTurns;
    }

    // Tier 2: Highest Influence First
    if (a.influence !== b.influence) {
      return b.influence - a.influence; // Descending
    }

    // Tier 3: FIFO Queue Timestamp (earlier queuedTurn first, then fifoIndex)
    if (a.queuedTurn !== b.queuedTurn) {
      return a.queuedTurn - b.queuedTurn; // Ascending (older turn first)
    }
    if (a.fifoIndex !== b.fifoIndex) {
      return a.fifoIndex - b.fifoIndex; // Ascending (older index first)
    }

    // Tier 4: Active Player Priority (Active player resolves first)
    if (a.ownerId !== b.ownerId) {
      return a.ownerId === activePlayerId ? -1 : 1;
    }

    return 0;
  });
}

/**
 * Executes resolution of an arriving ticket when board has available space (< 5)
 */
export function resolveTicketStandard(
  state: PlayerQueueState,
  ticketId: string
): { success: boolean; triggeredOnDeploy: boolean; error?: string } {
  const index = state.queue.findIndex(t => t.id === ticketId);
  if (index === -1) return { success: false, triggeredOnDeploy: false, error: 'Ticket not found in queue.' };

  const ticket = state.queue[index];
  if (ticket.remainingTurns > 0) {
    return { success: false, triggeredOnDeploy: false, error: 'Ticket countdown has not reached 0.' };
  }

  if (state.board.length >= state.maxBoardCapacity) {
    return { success: false, triggeredOnDeploy: false, error: 'Board is at capacity (5 units). Capacity Triage required.' };
  }

  // Remove from queue
  state.queue.splice(index, 1);

  // Deploy to board
  state.board.push({
    id: `unit_${ticket.cardId}_${Date.now()}`,
    cardId: ticket.cardId,
    cardName: ticket.cardName,
    influence: ticket.influence,
    efficiency: 2,
    stamina: 3
  });

  return { success: true, triggeredOnDeploy: !!ticket.hasOnDeployAbility };
}

/**
 * Executes the Capacity Triage Protocol when board is full (5 units)
 * Resolves the exploit:
 * - Rerouted cards retain their calculated effective Shift cost and MUST be paid normally when played from hand
 * - Cannot receive a second queue discount
 * - Rerouting does NOT trigger On Deploy abilities
 * - Respects hand cap of 8 cards
 */
export function executeCapacityTriage(
  state: PlayerQueueState,
  ticketId: string,
  decision: TriageDecision
): TriageResult {
  const index = state.queue.findIndex(t => t.id === ticketId);
  if (index === -1) {
    return { success: false, actionTaken: 'DISCARDED_TO_BREAKROOM', triggeredOnDeploy: false, error: 'Ticket not found.' };
  }

  const ticket = state.queue[index];
  if (ticket.remainingTurns > 0) {
    return { success: false, actionTaken: 'DISCARDED_TO_BREAKROOM', triggeredOnDeploy: false, error: 'Ticket remaining turns > 0.' };
  }

  if (state.board.length < state.maxBoardCapacity) {
    return { success: false, actionTaken: 'DISCARDED_TO_BREAKROOM', triggeredOnDeploy: false, error: 'Board not at capacity. Standard deployment must be used.' };
  }

  // Handle Option 1: Retire existing board unit
  if (decision.type === 'RETIRE_EXISTING') {
    const boardIndex = state.board.findIndex(u => u.id === decision.boardUnitId);
    if (boardIndex === -1) {
      return { success: false, actionTaken: 'DISCARDED_TO_BREAKROOM', triggeredOnDeploy: false, error: 'Specified board unit not found to retire.' };
    }

    // Retire existing unit to breakroom
    const retired = state.board.splice(boardIndex, 1)[0];
    state.breakroom.push(retired.cardId);

    // Remove resolving ticket from queue
    state.queue.splice(index, 1);

    // Deploy arriving ticket into vacated slot
    state.board.push({
      id: `unit_${ticket.cardId}_${Date.now()}`,
      cardId: ticket.cardId,
      cardName: ticket.cardName,
      influence: ticket.influence,
      efficiency: 2,
      stamina: 3
    });

    return {
      success: true,
      actionTaken: 'DEPLOYED_AFTER_RETIRE',
      deployedCardId: ticket.cardId,
      triggeredOnDeploy: !!ticket.hasOnDeployAbility
    };
  }

  // Handle Option 2: Reroute to Hand
  if (decision.type === 'REROUTE_TO_HAND') {
    // Atomicity guard: check hand capacity before modifying queue or resources
    if (state.hand.length >= state.maxHandCapacity) {
      return {
        success: false,
        actionTaken: 'DISCARDED_TO_BREAKROOM',
        triggeredOnDeploy: false,
        error: 'Hand is at maximum capacity (8 cards). Arriving card cannot be rerouted to hand.'
      };
    }

    // Remove from queue atomically
    const [ticket] = state.queue.splice(index, 1);

    // Model A: Refund the effective cost paid when queued
    const refundAmount = ticket.effectiveCost;
    state.shiftHours += refundAmount;
    state.pendingEscrowRefund = (state.pendingEscrowRefund || 0) + refundAmount;

    // Add to hand at original base cost and prohibit a second queue discount
    state.hand.push({
      cardId: ticket.cardId,
      cardName: ticket.cardName,
      baseCost: ticket.baseCost,
      shiftCostToPlay: ticket.baseCost, // Model A: MUST pay original base cost when played from hand
      influence: ticket.influence,
      canQueueDiscount: false,          // Exploit prevention: cannot queue again for extra discount
      isReroutedFromQueue: true,
      hasOnDeployAbility: ticket.hasOnDeployAbility
    });

    // CRITICAL: Rerouting does NOT trigger On Deploy or deploy to board
    return {
      success: true,
      actionTaken: 'REROUTED_TO_HAND',
      refundedShift: refundAmount,
      triggeredOnDeploy: false // Never triggers On Deploy on reroute
    };
  }

  // Handle Option 3: Discard to Breakroom
  if (decision.type === 'DISCARD_TO_BREAKROOM') {
    state.queue.splice(index, 1);
    state.breakroom.push(ticket.cardId);

    return {
      success: true,
      actionTaken: 'DISCARDED_TO_BREAKROOM',
      triggeredOnDeploy: false
    };
  }

  return { success: false, actionTaken: 'DISCARDED_TO_BREAKROOM', triggeredOnDeploy: false, error: 'Unknown decision type.' };
}

/**
 * Attempts to play a card from hand to the board during Phase 4 (Operational Action Phase)
 * Enforces that rerouted cards MUST pay their shiftCostToPlay and have board space.
 */
export function playCardFromHand(
  state: PlayerQueueState,
  handCardIndex: number
): { success: boolean; triggeredOnDeploy: boolean; error?: string } {
  if (handCardIndex < 0 || handCardIndex >= state.hand.length) {
    return { success: false, triggeredOnDeploy: false, error: 'Card index out of range.' };
  }

  const card = state.hand[handCardIndex];

  if (state.shiftHours < card.shiftCostToPlay) {
    return {
      success: false,
      triggeredOnDeploy: false,
      error: `Insufficient Shift hours (${state.shiftHours} available, ${card.shiftCostToPlay} required).`
    };
  }

  if (state.board.length >= state.maxBoardCapacity) {
    return {
      success: false,
      triggeredOnDeploy: false,
      error: 'Cannot play card: battlefield is at maximum capacity (5 units).'
    };
  }

  // Deduct Shift cost
  state.shiftHours -= card.shiftCostToPlay;

  // Remove from hand
  state.hand.splice(handCardIndex, 1);

  // Deploy to board
  state.board.push({
    id: `unit_${card.cardId}_${Date.now()}`,
    cardId: card.cardId,
    cardName: card.cardName,
    influence: 1,
    efficiency: 2,
    stamina: 3
  });

  return {
    success: true,
    triggeredOnDeploy: !!card.hasOnDeployAbility
  };
}

/**
 * ============================================================================
 * CANONICAL 5-PHASE TURN ORCHESTRATION FUNCTIONS
 * Implements strict phase execution according to FINALIZED_GAME_RULES.md Rule 3
 * ============================================================================
 */

/**
 * Phase 1: Shift Start (Automated Maintenance & Queue Resolution)
 * 1. Ticks countdown for all active queue tickets (remainingTurns - 1).
 * 2. Collects all tickets with remainingTurns === 0.
 * 3. Sorts them via 4-tier tie-breaking hierarchy.
 * 4. Resolves each ticket:
 *    - If board has space (< 5): Deploys to board via resolveTicketStandard.
 *    - If board is full (5/5): Opens Capacity Triage Window and executes decision.
 *      If Option 2 (REROUTE_TO_HAND) is selected, refunds effectiveCost into
 *      pendingEscrowRefund and shiftHours.
 */
export function executePhase1ShiftStart(
  state: PlayerQueueState,
  triageDecisions?: Map<string, TriageDecision>,
  activePlayerId?: 'p1' | 'p2'
): Phase1Result {
  const readyTickets = tickQueueCountdown(state);
  const sorted = sortResolvingTickets(readyTickets, activePlayerId || state.playerId);

  const deployedTickets: string[] = [];
  const triageResults: TriageResult[] = [];
  let refundedShiftTotal = 0;

  for (const ticket of sorted) {
    if (state.board.length < state.maxBoardCapacity) {
      const res = resolveTicketStandard(state, ticket.id);
      if (res.success) {
        deployedTickets.push(ticket.id);
      }
    } else {
      // Board saturated (5/5): Capacity Triage required
      const decision = triageDecisions?.get(ticket.id) || { type: 'DISCARD_TO_BREAKROOM' };
      const triageRes = executeCapacityTriage(state, ticket.id, decision);
      triageResults.push(triageRes);
      if (triageRes.refundedShift) {
        refundedShiftTotal += triageRes.refundedShift;
      }
      if (triageRes.actionTaken === 'DEPLOYED_AFTER_RETIRE') {
        deployedTickets.push(ticket.id);
      }
    }
  }

  return {
    ticketsTicked: state.queue.length + readyTickets.length,
    readyTickets: sorted,
    deployedTickets,
    triageResults,
    refundedShiftTotal
  };
}

/**
 * Phase 2: Shift Budgeting (Resource Allocation)
 * 1. Increments base Maximum Shift Capacity (+1 up to 10).
 * 2. Preserves any escrow refunds credited during Phase 1 of this turn.
 * 3. Refills spendable Shift: shiftHours = baseShiftCapacity + pendingEscrowRefund.
 * 4. Promotes pendingEscrowRefund to active temporaryShift.
 * 5. Clears pendingEscrowRefund = 0.
 */
export function executePhase2ShiftBudgeting(
  state: PlayerQueueState,
  targetTurn?: number
): Phase2Result {
  // Update base capacity progression
  if (targetTurn !== undefined) {
    state.baseShiftCapacity = Math.max(1, Math.min(10, targetTurn));
  } else {
    state.baseShiftCapacity = Math.min(10, (state.baseShiftCapacity || 1) + 1);
  }

  // Promote any Phase 1 escrow refund to active temporary Shift for this turn
  const pendingRefund = state.pendingEscrowRefund || 0;
  state.temporaryShift = (state.temporaryShift || 0) + pendingRefund;
  state.pendingEscrowRefund = 0;

  // Refill spendable Shift to base capacity + active temporary Shift (including refunds)
  state.shiftHours = state.baseShiftCapacity + state.temporaryShift;

  return {
    turn: state.baseShiftCapacity,
    baseCapacity: state.baseShiftCapacity,
    temporaryShift: state.temporaryShift,
    totalShiftHours: state.shiftHours
  };
}

/**
 * Phase 3: Administrative Draw
 * 1. Draws 1 card from deck into hand.
 * 2. Enforces hand limit of 8 cards. If hand > 8, discarded to breakroom.
 */
export function executePhase3AdministrativeDraw(
  state: PlayerQueueState
): Phase3Result {
  if (!state.deck || state.deck.length === 0) {
    return { handSize: state.hand.length };
  }

  const drawnCardId = state.deck.shift()!;
  if (state.hand.length < state.maxHandCapacity) {
    state.hand.push({
      cardId: drawnCardId,
      cardName: `Card ${drawnCardId}`,
      baseCost: 2,
      shiftCostToPlay: 2,
      influence: 1,
      canQueueDiscount: true,
      isReroutedFromQueue: false
    });
    return { drawnCardId, handSize: state.hand.length };
  } else {
    // Hand full: burned to breakroom
    state.breakroom.push(drawnCardId);
    return { burnedCardId: drawnCardId, handSize: state.hand.length };
  }
}

/**
 * Phase 5: Shift Conclusion / Clock Out (End Phase)
 * 1. Clears temporary Shift from this turn.
 * 2. Unspent spendable Shift expires, resetting shiftHours to 0 for turn transition.
 */
export function executePhase5ClockOut(
  state: PlayerQueueState
): Phase5Result {
  const clearedTemporaryShift = state.temporaryShift || 0;
  const unspentShiftHoursExpired = state.shiftHours || 0;

  state.temporaryShift = 0;
  state.pendingEscrowRefund = 0;
  state.shiftHours = 0;

  return {
    clearedTemporaryShift,
    unspentShiftHoursExpired,
    finalShiftHours: 0
  };
}

