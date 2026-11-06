import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createPlayerQueueState,
  queueCard,
  tickQueueCountdown,
  sortResolvingTickets,
  resolveTicketStandard,
  executeCapacityTriage,
  playCardFromHand,
  calculateQueueCost,
  QueuedTicket,
  TriageDecision,
  executePhase1ShiftStart,
  executePhase2ShiftBudgeting,
  executePhase3AdministrativeDraw,
  executePhase5ClockOut
} from '../booking_queue.js';

describe('Booking Queue Engine & Capacity Triage Protocol', () => {

  describe('Payment Timing & Lifecycle Accounting (Canonical 6-Cost / 2-Turn Example)', () => {

    it('Step 1: Upfront Payment — pays 5 Shift at queue entry, rejects if insufficient Shift', () => {
      const state = createPlayerQueueState('p1');
      const testCard = {
        cardId: 'card_canon_6',
        cardName: 'Senior Coordinator',
        baseCost: 6,
        influence: 2
      };

      // Player has 4 Shift: cannot afford 5 Shift effective cost
      state.shiftHours = 4;
      const underfunded = queueCard(state, testCard, 2, 1);
      assert.strictEqual(underfunded.success, false);
      assert.strictEqual(underfunded.effectiveCost, undefined);
      assert.match(underfunded.error || '', /Insufficient Shift hours/i);
      assert.strictEqual(state.queue.length, 0);
      assert.strictEqual(state.shiftHours, 4); // No Shift deducted

      // Player has 5 Shift: pays 5 Shift upfront
      state.shiftHours = 5;
      const funded = queueCard(state, testCard, 2, 1);
      assert.strictEqual(funded.success, true);
      assert.strictEqual(funded.effectiveCost, 5);
      assert.strictEqual(state.shiftHours, 0); // 5 Shift deducted immediately upon queue entry
      assert.strictEqual(state.queue.length, 1);
      assert.strictEqual(state.queue[0].baseCost, 6);
      assert.strictEqual(state.queue[0].effectiveCost, 5);
      assert.strictEqual(state.queue[0].remainingTurns, 2);
    });

    it('Duration Bounds: strictly enforces 1 to 4 turn queue duration limit', () => {
      const state = createPlayerQueueState('p1');
      state.shiftHours = 10;
      const testCard = {
        cardId: 'card_duration_test',
        cardName: 'Duration Tester',
        baseCost: 6,
        influence: 1
      };

      // 0 turns is invalid
      const zeroTurns = queueCard(state, testCard, 0, 1);
      assert.strictEqual(zeroTurns.success, false);
      assert.match(zeroTurns.error || '', /between 1 and 4 turns/i);

      // 5 turns is invalid (exceeds max 4 turns)
      const fiveTurns = queueCard(state, testCard, 5, 1);
      assert.strictEqual(fiveTurns.success, false);
      assert.match(fiveTurns.error || '', /between 1 and 4 turns/i);

      // 4 turns is valid (maximum allowed delay)
      const fourTurns = queueCard(state, testCard, 4, 1);
      assert.strictEqual(fourTurns.success, true);
      // Base 6 with 4 turns: 6 - (4 * 0.75) = 6 - 3 = 3 Shift
      assert.strictEqual(fourTurns.effectiveCost, 3);
      assert.strictEqual(state.queue.length, 1);
    });

    it('Step 2: Normal Resolution — deploys to battlefield with ZERO additional Shift cost', () => {
      const state = createPlayerQueueState('p1');
      state.shiftHours = 5;
      const testCard = {
        cardId: 'card_canon_6',
        cardName: 'Senior Coordinator',
        baseCost: 6,
        influence: 2
      };

      // Queue card for 2 turns (pays 5 Shift upfront)
      const queued = queueCard(state, testCard, 2, 1);
      assert.strictEqual(queued.success, true);
      assert.strictEqual(state.shiftHours, 0);

      // Turn 2 Shift Start: countdown ticks 2 -> 1
      tickQueueCountdown(state);
      assert.strictEqual(state.queue[0].remainingTurns, 1);

      // Turn 3 Shift Start: countdown ticks 1 -> 0
      const resolving = tickQueueCountdown(state);
      assert.strictEqual(resolving.length, 1);
      assert.strictEqual(state.queue[0].remainingTurns, 0);

      // Resolve to board: Player has 0 Shift in pool
      state.shiftHours = 0;
      const resolveResult = resolveTicketStandard(state, state.queue[0].id);
      assert.strictEqual(resolveResult.success, true);
      assert.strictEqual(state.board.length, 1);
      assert.strictEqual(state.board[0].cardId, 'card_canon_6');
      assert.strictEqual(state.queue.length, 0);
      // Zero additional Shift was deducted on battlefield arrival
      assert.strictEqual(state.shiftHours, 0);
    });

    it('Model A Canonical Lifecycle: executes 5-Shift refund upon reroute, restores 6-cost base, and verifies 11-Shift capacity interaction', () => {
      const state = createPlayerQueueState('p1');
      state.shiftHours = 5;
      const testCard = {
        cardId: 'card_canon_6',
        cardName: 'Senior Coordinator',
        baseCost: 6,
        influence: 2
      };

      // 1. Pay 5 Shift upfront to queue
      const queueResult = queueCard(state, testCard, 2, 1);
      assert.strictEqual(queueResult.success, true);
      assert.strictEqual(state.shiftHours, 0); // 5 Shift paid upfront

      // Simulate 2 turns passing to arrival turn
      state.queue[0].remainingTurns = 0;

      // On arrival turn, player receives normal Shift allocation (e.g. 6 Shift)
      state.shiftHours = 6;

      // Fill board to 5 units to trigger Capacity Triage
      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `u_${i}`,
          cardId: `c_${i}`,
          cardName: `Unit ${i}`,
          influence: 1,
          efficiency: 1,
          stamina: 1
        });
      }

      // 2. Capacity Triage: Reroute to hand (Model A)
      const ticketId = state.queue[0].id;
      const triage = executeCapacityTriage(state, ticketId, { type: 'REROUTE_TO_HAND' });
      assert.strictEqual(triage.success, true);
      assert.strictEqual(triage.refundedShift, 5); // 5 Shift refunded
      assert.strictEqual(state.hand.length, 1);
      assert.strictEqual(state.queue.length, 0);

      // EXACT RESULTING SHIFT BALANCE:
      // Normal allocation (6) + Refund (5) = 11 Shift! Exceeds normal capacity of 6 without capping.
      assert.strictEqual(state.shiftHours, 11);

      const handCard = state.hand[0];
      // Model A requirement: card returns to hand at original base cost (6 Shift), NOT discounted cost (5)
      assert.strictEqual(handCard.baseCost, 6);
      assert.strictEqual(handCard.shiftCostToPlay, 6);
      assert.strictEqual(handCard.canQueueDiscount, false);
      assert.strictEqual(handCard.isReroutedFromQueue, true);

      // Re-queue attempt is rejected (anti-exploit: cannot queue again)
      const requeue = queueCard(state, handCard, 2, 3);
      assert.strictEqual(requeue.success, false);
      assert.match(requeue.error || '', /cannot receive a second queue discount/i);

      // 3. Play from hand: requires full base cost of 6 Shift
      state.board.pop(); // Vacate 1 slot (4 units on board)
      const playResult = playCardFromHand(state, 0);
      assert.strictEqual(playResult.success, true);
      assert.strictEqual(state.shiftHours, 5); // 11 - 6 = 5 Shift remaining
      assert.strictEqual(state.board.length, 5);
      assert.strictEqual(state.hand.length, 0);

      // Net economic accounting across entire lifecycle:
      // Turn 1: -5 Shift (queue entry)
      // Turn 3: +6 Shift (turn refill) + 5 Shift (refund) - 6 Shift (played from hand) = +5 Shift net.
      // Card cost paid net: (5 - 5 + 6) = 6 Shift (exactly original base cost, zero double-charge, zero exploit).
    });

    it('Refund Integrity & Anti-Exploit: validates single refund, no double refund, and zero refund on deploy/discard', () => {
      const state = createPlayerQueueState('p1');
      state.shiftHours = 10;

      // Setup 3 tickets: t_deploy, t_discard, t_reroute
      const cardA = { cardId: 'c_a', cardName: 'Card A', baseCost: 4, influence: 1 };
      const cardB = { cardId: 'c_b', cardName: 'Card B', baseCost: 4, influence: 1 };
      const cardC = { cardId: 'c_c', cardName: 'Card C', baseCost: 4, influence: 1 };

      // Queue all 3 for 1 turn (effective cost = 4 - 0.75 = 3.25 -> 3 Shift each)
      queueCard(state, cardA, 1, 1);
      queueCard(state, cardB, 1, 1);
      queueCard(state, cardC, 1, 1);
      assert.strictEqual(state.shiftHours, 1); // 10 - 3*3 = 1 Shift remaining

      // Simulate tickets reaching 0 remaining turns
      for (const t of state.queue) t.remainingTurns = 0;

      // 1. Successful Deploy (Standard): receives NO refund
      // Fill board to 4 units (has 1 slot open)
      for (let i = 1; i <= 4; i++) {
        state.board.push({ id: `b_${i}`, cardId: `w_${i}`, cardName: `W ${i}`, influence: 1, efficiency: 1, stamina: 1 });
      }
      const initialShift = state.shiftHours; // 1
      const deployResult = resolveTicketStandard(state, state.queue[0].id);
      assert.strictEqual(deployResult.success, true);
      assert.strictEqual(state.shiftHours, initialShift); // NO REFUND on standard deploy!

      // Board is now at capacity (5/5).
      assert.strictEqual(state.board.length, 5);

      // 2. Discarded Ticket (Option 3): receives NO refund
      const ticketToDiscardId = state.queue[0].id;
      const discardResult = executeCapacityTriage(state, ticketToDiscardId, { type: 'DISCARD_TO_BREAKROOM' });
      assert.strictEqual(discardResult.success, true);
      assert.strictEqual(discardResult.refundedShift, undefined);
      assert.strictEqual(state.shiftHours, initialShift); // NO REFUND on discard to breakroom!
      assert.strictEqual(state.breakroom.length, 1);

      // 3. Rerouted Ticket (Option 2): receives EXACTLY ONE refund
      const ticketToRerouteId = state.queue[0].id;
      const rerouteResult = executeCapacityTriage(state, ticketToRerouteId, { type: 'REROUTE_TO_HAND' });
      assert.strictEqual(rerouteResult.success, true);
      assert.strictEqual(rerouteResult.refundedShift, 3);
      assert.strictEqual(state.shiftHours, initialShift + 3); // 1 + 3 = 4 Shift

      // 4. Double Refund Prevention: re-triaging the same ticket must fail with zero refund
      const doubleRefundAttempt = executeCapacityTriage(state, ticketToRerouteId, { type: 'REROUTE_TO_HAND' });
      assert.strictEqual(doubleRefundAttempt.success, false);
      assert.strictEqual(doubleRefundAttempt.error, 'Ticket not found.');
      assert.strictEqual(state.shiftHours, initialShift + 3); // Shift unchanged, no double refund!

      // 5. Deploy after Retire (Option 1): receives NO refund
      state.queue.push({
        id: 'ticket_retire_test',
        cardId: 'c_retire_test',
        cardName: 'Retire Test',
        baseCost: 5,
        effectiveCost: 4,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 1,
        ownerId: 'p1',
        fifoIndex: 99
      });
      const shiftBeforeRetire = state.shiftHours;
      const retireResult = executeCapacityTriage(state, 'ticket_retire_test', {
        type: 'RETIRE_EXISTING',
        boardUnitId: 'b_1'
      });
      assert.strictEqual(retireResult.success, true);
      assert.strictEqual(retireResult.refundedShift, undefined);
      assert.strictEqual(state.shiftHours, shiftBeforeRetire); // NO REFUND on retire & deploy!
    });

    it('Atomicity Guard: failed reroute due to full hand leaves ticket in queue and grants ZERO refund', () => {
      const state = createPlayerQueueState('p1');
      state.shiftHours = 5;

      // Fill board (5 units)
      for (let i = 1; i <= 5; i++) {
        state.board.push({ id: `b_${i}`, cardId: `w_${i}`, cardName: `W ${i}`, influence: 1, efficiency: 1, stamina: 1 });
      }

      // Fill hand to max capacity (8 cards)
      for (let i = 1; i <= 8; i++) {
        state.hand.push({
          cardId: `h_${i}`,
          cardName: `Hand ${i}`,
          baseCost: 2,
          shiftCostToPlay: 2,
          influence: 1,
          canQueueDiscount: true,
          isReroutedFromQueue: false
        });
      }

      // Add resolving ticket
      state.queue.push({
        id: 't_atomic',
        cardId: 'c_atomic',
        cardName: 'Atomic Test',
        baseCost: 6,
        effectiveCost: 5,
        queuedTurn: 1,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1
      });

      // Attempt reroute with 8 cards in hand
      const failedReroute = executeCapacityTriage(state, 't_atomic', { type: 'REROUTE_TO_HAND' });
      assert.strictEqual(failedReroute.success, false);
      assert.match(failedReroute.error || '', /maximum capacity \(8 cards\)/i);

      // ATOMIC VERIFICATION:
      // 1. Shift hours unchanged (zero refund leaked)
      assert.strictEqual(state.shiftHours, 5);
      // 2. Ticket remains in queue
      assert.strictEqual(state.queue.length, 1);
      assert.strictEqual(state.queue[0].id, 't_atomic');
      // 3. Hand size remains 8
      assert.strictEqual(state.hand.length, 8);
    });

  });

  it('calculates queue discount with 1-Shift minimum floor', () => {
    // 2-cost card queued for 3 turns: 2 - (3 * 0.75) = 2 - 2.25 = -0.25 -> clamped to 1
    assert.strictEqual(calculateQueueCost(2, 3), 1);
    // 6-cost card queued for 2 turns: 6 - (2 * 0.75) = 6 - 1.5 = 4.5 -> round to 5
    assert.strictEqual(calculateQueueCost(6, 2), 5);
    // 4-cost card queued for 1 turn: 4 - 0.75 = 3.25 -> round to 3
    assert.strictEqual(calculateQueueCost(4, 1), 3);
  });

  it('enforces 4-tier hierarchical resolution tie-breaking', () => {
    const tickets: QueuedTicket[] = [
      {
        id: 't_alpha',
        cardId: 'c_alpha',
        cardName: 'Alpha Specialist',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 2,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1
      },
      {
        id: 't_beta',
        cardId: 'c_beta',
        cardName: 'Beta Manager',
        baseCost: 5,
        effectiveCost: 4,
        queuedTurn: 3,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 4, // Highest influence
        ownerId: 'p1',
        fifoIndex: 2
      },
      {
        id: 't_gamma',
        cardId: 'c_gamma',
        cardName: 'Gamma Assistant',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 2,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 2, // Tied with Alpha, but entered after Alpha on Turn 2
        ownerId: 'p1',
        fifoIndex: 3
      },
      {
        id: 't_delta_p2',
        cardId: 'c_delta',
        cardName: 'Delta Coordinator',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 2,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p2', // Inactive player during p1 turn
        fifoIndex: 4
      }
    ];

    const sorted = sortResolvingTickets(tickets, 'p1');

    // 1st: t_beta (Highest Influence: 4)
    assert.strictEqual(sorted[0].id, 't_beta');
    // 2nd: t_alpha (Influence 2, queuedTurn 2, fifoIndex 1, owned by P1)
    assert.strictEqual(sorted[1].id, 't_alpha');
    // 3rd: t_gamma (Influence 2, queuedTurn 2, fifoIndex 3, owned by P1)
    assert.strictEqual(sorted[2].id, 't_gamma');
    // 4th: t_delta_p2 (Influence 2, but owned by Inactive Player P2 -> APNAP)
    assert.strictEqual(sorted[3].id, 't_delta_p2');
  });

  describe('Capacity Triage Anti-Exploit Verification', () => {

    it('Option 1: Retires existing unit, deploys arriving card, triggers On Deploy', () => {
      const state = createPlayerQueueState('p1');
      // Fill board to maximum capacity (5 units)
      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `board_unit_${i}`,
          cardId: `card_worker_${i}`,
          cardName: `Worker ${i}`,
          influence: 1,
          efficiency: 2,
          stamina: 2
        });
      }
      assert.strictEqual(state.board.length, 5);

      // Add a queued ticket that reaches 0 remaining turns
      state.queue.push({
        id: 'ticket_boss',
        cardId: 'card_director',
        cardName: 'Booking Director',
        baseCost: 6,
        effectiveCost: 5,
        queuedTurn: 2,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 3,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      const result = executeCapacityTriage(state, 'ticket_boss', {
        type: 'RETIRE_EXISTING',
        boardUnitId: 'board_unit_2'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.actionTaken, 'DEPLOYED_AFTER_RETIRE');
      assert.strictEqual(result.triggeredOnDeploy, true);
      assert.strictEqual(state.board.length, 5);
      // Unit 2 sent to breakroom
      assert.deepStrictEqual(state.breakroom, ['card_worker_2']);
      // Director is now on board
      assert.strictEqual(state.board.some(u => u.cardId === 'card_director'), true);
      // Removed from queue
      assert.strictEqual(state.queue.length, 0);
    });

    it('Option 2: Reroutes to hand, retains effective Shift cost, prohibits 0-cost exploit, does not trigger On Deploy', () => {
      const state = createPlayerQueueState('p1');
      // Fill board to 5 units
      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `board_unit_${i}`,
          cardId: `worker_${i}`,
          cardName: `Worker ${i}`,
          influence: 1,
          efficiency: 2,
          stamina: 2
        });
      }

      // Card queued originally for 6 Shift with 2 turns discount (effective cost = 5)
      state.queue.push({
        id: 'ticket_swat',
        cardId: 'card_swat_lead',
        cardName: 'SWAT Lead',
        baseCost: 6,
        effectiveCost: 5,
        queuedTurn: 1,
        queueDuration: 2,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      const result = executeCapacityTriage(state, 'ticket_swat', {
        type: 'REROUTE_TO_HAND'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.actionTaken, 'REROUTED_TO_HAND');
      // CRITICAL: Reroute NEVER triggers on deploy
      assert.strictEqual(result.triggeredOnDeploy, false);
      assert.strictEqual(state.board.length, 5);
      assert.strictEqual(state.queue.length, 0);
      assert.strictEqual(state.hand.length, 1);

      const handCard = state.hand[0];
      // CRITICAL BALANCE VERIFICATION (MODEL A):
      // It does NOT cost 0 Shift, nor the discounted cost (5). It requires paying the original base cost (6 Shift).
      assert.strictEqual(handCard.shiftCostToPlay, 6);
      assert.strictEqual(handCard.canQueueDiscount, false);
      assert.strictEqual(handCard.isReroutedFromQueue, true);

      // Attempting to re-queue this rerouted card for a second discount must fail
      const requeueAttempt = queueCard(state, handCard, 2, 4);
      assert.strictEqual(requeueAttempt.success, false);
      assert.match(requeueAttempt.error || '', /cannot receive a second queue discount/i);

      // Attempting to play the rerouted card when player only has 5 Shift must fail (needs 6 Shift)!
      state.shiftHours = 5;
      const playUnderfunded = playCardFromHand(state, 0);
      assert.strictEqual(playUnderfunded.success, false);
      assert.match(playUnderfunded.error || '', /Insufficient Shift hours/i);

      // Give player 6 Shift, but board is still at 5/5 -> play must fail because board is full!
      state.shiftHours = 6;
      const playBoardFull = playCardFromHand(state, 0);
      assert.strictEqual(playBoardFull.success, false);
      assert.match(playBoardFull.error || '', /battlefield is at maximum capacity/i);

      // Free a board slot (1 unit dies or is retired in combat)
      state.board.pop();
      assert.strictEqual(state.board.length, 4);

      // Now playing card from hand succeeds, spends the full 6 Shift, and triggers On Deploy upon actual battlefield entry
      const playLegit = playCardFromHand(state, 0);
      assert.strictEqual(playLegit.success, true);
      assert.strictEqual(playLegit.triggeredOnDeploy, true);
      assert.strictEqual(state.shiftHours, 0); // Spent exactly 6 Shift
      assert.strictEqual(state.board.length, 5);
      assert.strictEqual(state.hand.length, 0);
    });

    it('Option 2 enforces hand cap of 8 cards', () => {
      const state = createPlayerQueueState('p1');
      // Fill board to 5 units
      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `u_${i}`,
          cardId: `c_${i}`,
          cardName: `Worker ${i}`,
          influence: 1,
          efficiency: 1,
          stamina: 1
        });
      }
      // Fill hand to 8 cards
      for (let i = 1; i <= 8; i++) {
        state.hand.push({
          cardId: `hand_${i}`,
          cardName: `Hand Card ${i}`,
          baseCost: 2,
          shiftCostToPlay: 2,
          influence: 1,
          canQueueDiscount: true,
          isReroutedFromQueue: false
        });
      }

      state.queue.push({
        id: 't_overflow',
        cardId: 'c_overflow',
        cardName: 'Overflow Unit',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 1,
        ownerId: 'p1',
        fifoIndex: 1
      });

      // Attempting to reroute when hand is full must fail
      const result = executeCapacityTriage(state, 't_overflow', {
        type: 'REROUTE_TO_HAND'
      });
      assert.strictEqual(result.success, false);
      assert.match(result.error || '', /maximum capacity/i);
    });

    it('Option 3: Discards arriving unit to Breakroom if chosen', () => {
      const state = createPlayerQueueState('p1');
      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `u_${i}`,
          cardId: `c_${i}`,
          cardName: `Unit ${i}`,
          influence: 1,
          efficiency: 1,
          stamina: 1
        });
      }

      state.queue.push({
        id: 't_discard',
        cardId: 'c_unneeded',
        cardName: 'Unneeded Tech',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 1,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      const result = executeCapacityTriage(state, 't_discard', {
        type: 'DISCARD_TO_BREAKROOM'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.actionTaken, 'DISCARDED_TO_BREAKROOM');
      assert.strictEqual(result.triggeredOnDeploy, false);
      assert.strictEqual(state.queue.length, 0);
      assert.deepStrictEqual(state.breakroom, ['c_unneeded']);
    });

  });

  describe('Canonical 5-Phase Turn Sequence & Escrow Integration (Turn 6 Scenario)', () => {

    it('executes full end-to-end turn in strict phase order with 6 max capacity and 5 Shift refund', () => {
      const state = createPlayerQueueState('p1');

      // Setup Turn 6 initial conditions:
      // - Max Shift capacity for Turn 6 is 6
      // - 0 unspent Shift from Turn 5 (expired at Turn 5 Clock Out)
      // - Battlefield is saturated at 5/5
      // - Hand has 3 cards (Hand cap 8)
      // - Deck has cards available to draw
      // - 1 ticket in queue: Senior Coordinator (Base 6, queued 2 turns ago for 5 Shift)
      state.baseShiftCapacity = 5; // Will increment to 6 in Phase 2
      state.shiftHours = 0;        // Unspent Shift from previous turn expired in Phase 5
      state.temporaryShift = 0;
      state.pendingEscrowRefund = 0;
      state.deck = ['draw_card_1', 'draw_card_2'];

      for (let i = 1; i <= 5; i++) {
        state.board.push({
          id: `board_unit_${i}`,
          cardId: `card_unit_${i}`,
          cardName: `Active Worker ${i}`,
          influence: 1,
          efficiency: 2,
          stamina: 3
        });
      }

      for (let i = 1; i <= 3; i++) {
        state.hand.push({
          cardId: `hand_card_${i}`,
          cardName: `Hand Item ${i}`,
          baseCost: 2,
          shiftCostToPlay: 2,
          influence: 1,
          canQueueDiscount: true,
          isReroutedFromQueue: false
        });
      }

      state.queue.push({
        id: 'ticket_canon_6',
        cardId: 'card_canon_6',
        cardName: 'Senior Coordinator',
        baseCost: 6,
        effectiveCost: 5,
        queuedTurn: 4,
        queueDuration: 2,
        remainingTurns: 1, // Will tick 1 -> 0 at Phase 1 Shift Start
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      // ======================================================================
      // PHASE 1: SHIFT START (Queue countdown, resolution & Capacity Triage)
      // ======================================================================
      assert.strictEqual(state.shiftHours, 0, 'Entering turn with 0 Shift');
      assert.strictEqual(state.board.length, 5, 'Board is saturated (5/5)');

      const triageDecisions = new Map<string, TriageDecision>([
        ['ticket_canon_6', { type: 'REROUTE_TO_HAND' }]
      ]);

      const phase1Result = executePhase1ShiftStart(state, triageDecisions);

      // Verify Phase 1 outcomes:
      assert.strictEqual(phase1Result.readyTickets.length, 1);
      assert.strictEqual(phase1Result.readyTickets[0].id, 'ticket_canon_6');
      assert.strictEqual(phase1Result.readyTickets[0].remainingTurns, 0);
      assert.strictEqual(phase1Result.triageResults.length, 1);
      assert.strictEqual(phase1Result.triageResults[0].actionTaken, 'REROUTED_TO_HAND');
      assert.strictEqual(phase1Result.refundedShiftTotal, 5);

      // Verify Phase 1 state mutations:
      assert.strictEqual(state.queue.length, 0, 'Ticket removed from queue');
      assert.strictEqual(state.hand.length, 4, 'Card rerouted to hand (3 -> 4 cards)');
      assert.strictEqual(state.pendingEscrowRefund, 5, 'Pending escrow refund holds 5 Shift');
      assert.strictEqual(state.shiftHours, 5, 'Phase 1 Shift balance reflects 5 Shift refund');

      const reroutedCard = state.hand.find(c => c.cardId === 'card_canon_6')!;
      assert.strictEqual(reroutedCard.baseCost, 6, 'Retains original base cost 6');
      assert.strictEqual(reroutedCard.shiftCostToPlay, 6, 'Must pay full 6 Shift from hand');
      assert.strictEqual(reroutedCard.canQueueDiscount, false, 'Second queue discount prohibited');

      // ======================================================================
      // PHASE 2: SHIFT BUDGETING (Resource Allocation)
      // ======================================================================
      const phase2Result = executePhase2ShiftBudgeting(state, 6);

      // Verify Phase 2 outcomes:
      assert.strictEqual(phase2Result.baseCapacity, 6, 'Turn 6 base capacity is 6 Shift');
      assert.strictEqual(phase2Result.temporaryShift, 5, 'Phase 1 refund promoted to temporary Shift');
      assert.strictEqual(phase2Result.totalShiftHours, 11, 'Total Shift is 6 base + 5 refund = 11 Shift');

      // Verify Phase 2 state mutations:
      assert.strictEqual(state.baseShiftCapacity, 6);
      assert.strictEqual(state.temporaryShift, 5);
      assert.strictEqual(state.pendingEscrowRefund, 0, 'Pending refund cleared after promotion');
      assert.strictEqual(state.shiftHours, 11, 'Spendable Shift balance after Phase 2 is exactly 11');

      // ======================================================================
      // PHASE 3: ADMINISTRATIVE DRAW
      // ======================================================================
      const phase3Result = executePhase3AdministrativeDraw(state);

      assert.strictEqual(phase3Result.drawnCardId, 'draw_card_1');
      assert.strictEqual(phase3Result.handSize, 5, 'Hand size is now 5');
      assert.strictEqual(state.shiftHours, 11, 'Shift balance remains 11 during Phase 3');

      // ======================================================================
      // PHASE 4: OPERATIONAL ACTION PHASE (Play Rerouted Card)
      // ======================================================================
      const reroutedIndex = state.hand.findIndex(c => c.cardId === 'card_canon_6');
      assert.ok(reroutedIndex >= 0);

      // Attempting to play while board is full (5/5) is rejected
      const fullBoardPlay = playCardFromHand(state, reroutedIndex);
      assert.strictEqual(fullBoardPlay.success, false);
      assert.match(fullBoardPlay.error || '', /battlefield is at maximum capacity/i);
      assert.strictEqual(state.shiftHours, 11, 'No Shift spent on failed play attempt');

      // Friendly unit trades off / is retired in combat, opening a slot (5 -> 4 units)
      state.board.pop();
      assert.strictEqual(state.board.length, 4);

      // Now playing rerouted card succeeds: spends 6 Shift, deploys to board, triggers On Deploy
      const playResult = playCardFromHand(state, reroutedIndex);
      assert.strictEqual(playResult.success, true);
      assert.strictEqual(playResult.triggeredOnDeploy, true);
      assert.strictEqual(state.board.length, 5, 'Board filled back to 5 units');
      assert.strictEqual(state.shiftHours, 5, 'Shift balance is 11 - 6 = 5 Shift remaining');

      // ======================================================================
      // PHASE 5: CLOCK OUT (End Phase / Cleanup)
      // ======================================================================
      const phase5Result = executePhase5ClockOut(state);

      assert.strictEqual(phase5Result.clearedTemporaryShift, 5, 'Temporary Shift cleared');
      assert.strictEqual(phase5Result.unspentShiftHoursExpired, 5, 'Unspent 5 Shift expired');
      assert.strictEqual(phase5Result.finalShiftHours, 0, 'Final Shift reset to 0 for next turn');
      assert.strictEqual(state.shiftHours, 0, 'State shiftHours is 0 ready for Turn 7 refill');
    });

  });
});
