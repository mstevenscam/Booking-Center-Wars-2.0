import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  createInitialGameState,
  validateDeck,
  moveCardZone,
  cloneGameState,
  serializeGameState,
  deserializeGameState,
  CardDefinition,
  GameState
} from '../state.js';
import {
  advanceToNextPhase,
  executeShiftStart,
  executeShiftBudgeting,
  executeAdministrativeDraw,
  executeClockOut,
  evaluateStateBasedActions
} from '../turn_manager.js';
import {
  validateAction,
  executeAction
} from '../actions.js';

function createMockDeck(): CardDefinition[] {
  const deck: CardDefinition[] = [];
  // 15 unique card pairs = 30 cards total
  for (let i = 1; i <= 15; i++) {
    deck.push({
      id: `mock_card_${i}`,
      name: `Mock Worker ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 6) + 1,
      influence: (i % 3) + 1,
      efficiency: 2,
      stamina: 3,
      hasOnDeployAbility: i % 4 === 0
    });
    deck.push({
      id: `mock_card_${i}`,
      name: `Mock Worker ${i}`,
      cardType: 'CHARACTER',
      baseCost: (i % 6) + 1,
      influence: (i % 3) + 1,
      efficiency: 2,
      stamina: 3,
      hasOnDeployAbility: i % 4 === 0
    });
  }
  return deck;
}

describe('Phase 2A: Core Game Engine Foundation', () => {

  describe('Deck Validation & Deck Construction Rules', () => {
    it('approves a valid 30-card deck with max 2 copies per card ID', () => {
      const validDeck = createMockDeck();
      const result = validateDeck(validDeck);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.totalCards, 30);
      assert.strictEqual(result.errors.length, 0);
    });

    it('rejects a deck with fewer than 30 cards', () => {
      const shortDeck = createMockDeck().slice(0, 28);
      const result = validateDeck(shortDeck);
      assert.strictEqual(result.valid, false);
      assert.match(result.errors[0], /exactly 30 cards/i);
    });

    it('rejects a deck with more than 30 cards', () => {
      const longDeck = [...createMockDeck(), createMockDeck()[0]];
      const result = validateDeck(longDeck);
      assert.strictEqual(result.valid, false);
      assert.match(result.errors[0], /exactly 30 cards/i);
    });

    it('rejects a deck with more than 2 copies of any card ID', () => {
      const illegalDeck = createMockDeck();
      // Replace the last card with a 3rd copy of card 1
      illegalDeck[29] = { ...illegalDeck[0] };
      const result = validateDeck(illegalDeck);
      assert.strictEqual(result.valid, false);
      assert.match(result.errors.join('; '), /exceeds 2-copy limit/i);
    });
  });

  describe('Match & Player Initialization', () => {
    it('initializes match under Config D (P1 4 cards, P2 5 cards + 1 Master Key)', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      assert.strictEqual(state.status, 'ACTIVE');
      assert.strictEqual(state.currentTurn, 1);
      assert.strictEqual(state.activePlayerId, 'p1');
      assert.strictEqual(state.currentPhase, 'SHIFT_START');

      // Player 1 initialization
      assert.strictEqual(state.players.p1.morale, 30);
      assert.strictEqual(state.players.p1.hand.length, 4);
      assert.strictEqual(state.players.p1.deck.length, 26);
      assert.strictEqual(state.players.p1.masterKeyCount, 0);
      assert.strictEqual(state.players.p1.baseShiftCapacity, 1);
      assert.strictEqual(state.players.p1.currentShift, 1);

      // Player 2 initialization
      assert.strictEqual(state.players.p2.morale, 30);
      assert.strictEqual(state.players.p2.hand.length, 5);
      assert.strictEqual(state.players.p2.deck.length, 25);
      assert.strictEqual(state.players.p2.masterKeyCount, 1); // 1 Master Key under Config D
    });

    it('initializes match under Config E (P1 4 cards, P2 5 cards + 2 Master Keys)', () => {
      const state = createInitialGameState({
        config: 'CONFIG_E',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      assert.strictEqual(state.players.p2.masterKeyCount, 2); // 2 Master Keys under Config E
      assert.strictEqual(state.players.p2.hand.length, 5);
    });

    it('guarantees unique card instance IDs across the match', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const allInstanceIds = new Set<string>();
      for (const player of [state.players.p1, state.players.p2]) {
        for (const card of [...player.deck, ...player.hand]) {
          assert.strictEqual(allInstanceIds.has(card.instanceId), false, `Duplicate ID: ${card.instanceId}`);
          allInstanceIds.add(card.instanceId);
        }
      }
      assert.strictEqual(allInstanceIds.size, 60); // 30 cards * 2 players
    });
  });

  describe('Card Zones & Movement Safety', () => {
    it('moves cards safely between Deck, Hand, Battlefield, and Breakroom', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const p1 = state.players.p1;
      const handCard = p1.hand[0];
      const instanceId = handCard.instanceId;

      // Hand -> Battlefield
      const move1 = moveCardZone(state, instanceId, 'BATTLEFIELD');
      assert.strictEqual(move1.success, true);
      assert.strictEqual(p1.hand.length, 3);
      assert.strictEqual(p1.battlefield.length, 1);
      assert.strictEqual(p1.battlefield[0].card.instanceId, instanceId);

      // Battlefield -> Breakroom
      const move2 = moveCardZone(state, instanceId, 'BREAKROOM');
      assert.strictEqual(move2.success, true);
      assert.strictEqual(p1.battlefield.length, 0);
      assert.strictEqual(p1.breakroom.length, 1);
      assert.strictEqual(p1.breakroom[0].instanceId, instanceId);

      // Breakroom -> Hand
      const move3 = moveCardZone(state, instanceId, 'HAND');
      assert.strictEqual(move3.success, true);
      assert.strictEqual(p1.breakroom.length, 0);
      assert.strictEqual(p1.hand.length, 4);
    });

    it('strictly enforces Battlefield maximum capacity of 5 characters', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const p1 = state.players.p1;
      // Deploy 4 cards to battlefield (hand has 4 cards)
      while (p1.hand.length > 0) {
        moveCardZone(state, p1.hand[0].instanceId, 'BATTLEFIELD');
      }
      // Draw 1 more and deploy (now 5 on battlefield)
      const topDeck1 = p1.deck[0];
      moveCardZone(state, topDeck1.instanceId, 'BATTLEFIELD');
      assert.strictEqual(p1.battlefield.length, 5);

      // Attempting to move a 6th card to battlefield must fail
      const topDeck2 = p1.deck[0];
      const moveFail = moveCardZone(state, topDeck2.instanceId, 'BATTLEFIELD');
      assert.strictEqual(moveFail.success, false);
      assert.match(moveFail.error || '', /maximum capacity \(5 characters\)/i);
      assert.strictEqual(p1.battlefield.length, 5);
    });

    it('strictly enforces Hand maximum capacity of 8 cards', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const p1 = state.players.p1;
      // Draw up to 8 cards
      while (p1.hand.length < 8) {
        moveCardZone(state, p1.deck[0].instanceId, 'HAND');
      }
      assert.strictEqual(p1.hand.length, 8);

      // Attempting to move 9th card to hand fails
      const overflowCard = p1.deck[0];
      const fail = moveCardZone(state, overflowCard.instanceId, 'HAND');
      assert.strictEqual(fail.success, false);
      assert.match(fail.error || '', /maximum capacity \(8 cards\)/i);
      assert.strictEqual(p1.hand.length, 8);
    });
  });

  describe('Canonical Turn Sequence & Phase Progression', () => {
    it('progresses smoothly through all 5 phases in strict sequence', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      assert.strictEqual(state.currentPhase, 'SHIFT_START');
      assert.strictEqual(state.activePlayerId, 'p1');

      // Advancing from Shift Start executes Shift Start, Budgeting, Draw and lands on Operational Action
      advanceToNextPhase(state);
      assert.strictEqual(state.currentPhase, 'OPERATIONAL_ACTION');
      assert.strictEqual(state.players.p1.baseShiftCapacity, 2); // Incremented in Phase 2
      assert.strictEqual(state.players.p1.currentShift, 2);
      assert.strictEqual(state.players.p1.hand.length, 5); // 4 initial + 1 drawn in Phase 3

      // Active player ends operational action phase
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });

      // Turn passes to Player 2
      assert.strictEqual(state.activePlayerId, 'p2');
      assert.strictEqual(state.currentPhase, 'SHIFT_START');

      // Player 2 advances to Operational Action
      advanceToNextPhase(state);
      assert.strictEqual(state.activePlayerId, 'p2');
      assert.strictEqual(state.currentPhase, 'OPERATIONAL_ACTION');
      assert.strictEqual(state.players.p2.baseShiftCapacity, 2);
      assert.strictEqual(state.players.p2.currentShift, 2);

      // Player 2 ends turn
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });

      // Round advances to Turn 2, active player returns to Player 1
      assert.strictEqual(state.activePlayerId, 'p1');
      assert.strictEqual(state.currentTurn, 2);
    });

    it('clears unspent temporary Shift at Phase 5 Clock Out', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      advanceToNextPhase(state); // In OPERATIONAL_ACTION
      state.players.p1.temporaryShift = 3;
      state.players.p1.currentShift = 5;

      executeClockOut(state);
      assert.strictEqual(state.players.p1.temporaryShift, 0);
      assert.strictEqual(state.players.p1.currentShift, 0);
    });
  });

  describe('Centralized Action Legality Validation', () => {
    it('rejects card play when it is not the active player turn', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      advanceToNextPhase(state); // p1 turn

      const p2Card = state.players.p2.hand[0];
      const validation = validateAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p2', // Not active player!
        cardInstanceId: p2Card.instanceId
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.code, 'NOT_ACTIVE_PLAYER');
      assert.match(validation.message || '', /It is currently Player P1's turn/i);
    });

    it('rejects card play outside Phase 4 (OPERATIONAL_ACTION)', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      state.currentPhase = 'SHIFT_START';

      const card = state.players.p1.hand[0];
      const validation = validateAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: card.instanceId
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.code, 'INVALID_PHASE');
    });

    it('rejects card play when Shift is insufficient', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      advanceToNextPhase(state);

      const card = state.players.p1.hand[0];
      card.currentCost = 10; // Expensive card
      state.players.p1.currentShift = 2; // Only 2 Shift available

      const validation = validateAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: card.instanceId
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.code, 'INSUFFICIENT_SHIFT');
    });

    it('rejects Master Key usage outside Phase 4 (Timing Lock)', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      state.currentPhase = 'SHIFT_START';
      state.players.p1.masterKeyCount = 1;

      const validation = validateAction(state, {
        type: 'USE_MASTER_KEY',
        playerId: 'p1'
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.code, 'MASTER_KEY_INVALID_PHASE');
      assert.match(validation.message || '', /ONLY be activated during OPERATIONAL_ACTION/i);
    });

    it('executes Master Key in Phase 4 and adds temporary Shift', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      advanceToNextPhase(state); // Phase 4
      state.players.p1.masterKeyCount = 1;
      const initialShift = state.players.p1.currentShift;

      const result = executeAction(state, {
        type: 'USE_MASTER_KEY',
        playerId: 'p1'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(state.players.p1.masterKeyCount, 0);
      assert.strictEqual(state.players.p1.temporaryShift, 1);
      assert.strictEqual(state.players.p1.currentShift, initialShift + 1);
    });

    it('rejects queue submission of a card that was rerouted from queue (zero second discount)', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      advanceToNextPhase(state);

      const card = state.players.p1.hand[0];
      card.canQueueDiscount = false; // Rerouted flag

      const validation = validateAction(state, {
        type: 'QUEUE_CARD',
        playerId: 'p1',
        cardInstanceId: card.instanceId,
        queueDuration: 2
      });

      assert.strictEqual(validation.valid, false);
      assert.strictEqual(validation.code, 'SECOND_QUEUE_DISCOUNT_PROHIBITED');
    });
  });

  describe('Burnout Fatigue Progression & Match Completion', () => {
    it('applies escalating fatigue damage (1, 2, 3...) when deck is empty in Phase 3', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const p1 = state.players.p1;
      p1.deck = []; // Empty deck
      assert.strictEqual(p1.morale, 30);
      assert.strictEqual(p1.fatigueCount, 0);

      // Draw 1 on empty deck -> 1 fatigue damage
      executeAdministrativeDraw(state);
      assert.strictEqual(p1.fatigueCount, 1);
      assert.strictEqual(p1.morale, 29);

      // Draw 2 on empty deck -> 2 fatigue damage
      executeAdministrativeDraw(state);
      assert.strictEqual(p1.fatigueCount, 2);
      assert.strictEqual(p1.morale, 27); // 29 - 2 = 27

      // Draw 3 on empty deck -> 3 fatigue damage
      executeAdministrativeDraw(state);
      assert.strictEqual(p1.fatigueCount, 3);
      assert.strictEqual(p1.morale, 24); // 27 - 3 = 24
    });

    it('ends match when Morale drops to 0 or lower', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      state.players.p2.morale = 0;
      evaluateStateBasedActions(state);

      assert.strictEqual(state.status, 'COMPLETED');
      assert.strictEqual(state.result?.winner, 'p1');
      assert.strictEqual(state.result?.loser, 'p2');
    });

    it('ends match on concession at any time', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      const result = executeAction(state, {
        type: 'CONCEDE',
        playerId: 'p1'
      });

      assert.strictEqual(result.success, true);
      assert.strictEqual(state.status, 'COMPLETED');
      assert.strictEqual(state.result?.winner, 'p2');
      assert.strictEqual(state.result?.loser, 'p1');
      assert.match(state.result?.winReason || '', /conceded/i);
    });
  });

  describe('Deterministic State Serialization & Consistency', () => {
    it('serializes and deserializes game state identically', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });
      advanceToNextPhase(state);

      const serialized = serializeGameState(state);
      const deserialized = deserializeGameState(serialized);

      assert.strictEqual(deserialized.matchId, state.matchId);
      assert.strictEqual(deserialized.currentTurn, state.currentTurn);
      assert.strictEqual(deserialized.activePlayerId, state.activePlayerId);
      assert.strictEqual(deserialized.currentPhase, state.currentPhase);
      assert.strictEqual(deserialized.players.p1.hand.length, state.players.p1.hand.length);
      assert.strictEqual(deserialized.players.p2.masterKeyCount, state.players.p2.masterKeyCount);
      assert.deepStrictEqual(deserialized, state);
    });

    it('preserves pendingDecision across serialization round-trip', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      // Fill board to 5/5
      for (let i = 1; i <= 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_p1_unit_${i}`,
            cardDefId: `unit_${i}`,
            ownerId: 'p1',
            currentZone: 'BATTLEFIELD',
            baseCost: 2,
            currentCost: 2,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: 1,
            efficiency: 2,
            stamina: 3,
            maxStamina: 3,
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      state.players.p1.queue.push({
        id: 't_pending_test',
        cardId: 'c_pending_test',
        cardName: 'Pending Unit',
        baseCost: 4,
        effectiveCost: 3,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      executeShiftStart(state);
      assert.notStrictEqual(state.pendingDecision, null);
      assert.strictEqual(state.pendingDecision?.type, 'CAPACITY_TRIAGE');
      if (state.pendingDecision?.type === 'CAPACITY_TRIAGE') {
        assert.strictEqual(state.pendingDecision.ticketId, 't_pending_test');
      }

      const serialized = serializeGameState(state);
      const deserialized = deserializeGameState(serialized);

      assert.notStrictEqual(deserialized.pendingDecision, null);
      assert.strictEqual(deserialized.pendingDecision?.type, 'CAPACITY_TRIAGE');
      if (deserialized.pendingDecision?.type === 'CAPACITY_TRIAGE') {
        assert.strictEqual(deserialized.pendingDecision.ticketId, 't_pending_test');
        assert.strictEqual(deserialized.pendingDecision.allowedOptions.length, 3);
      }
      assert.deepStrictEqual(deserialized, state);
    });

    it('rejects malformed or corrupted JSON safely when deserializing', () => {
      assert.throws(() => {
        deserializeGameState('INVALID_JSON');
      }, /Malformed JSON/i);

      assert.throws(() => {
        deserializeGameState('{"matchId": "test"}');
      }, /Missing required matchId, status, or player objects/i);

      assert.throws(() => {
        deserializeGameState('{"matchId": "test", "status": "ACTIVE", "players": {"p1": {}, "p2": {}}}');
      }, /Corrupted player Morale/i);
    });
  });

  describe('Capacity Triage Pending Decision & Interactive Resolution', () => {
    it('pauses in SHIFT_START with pendingDecision when board is 5/5 and does not silently choose', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      for (let i = 1; i <= 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_p1_unit_${i}`,
            cardDefId: `unit_${i}`,
            ownerId: 'p1',
            currentZone: 'BATTLEFIELD',
            baseCost: 2,
            currentCost: 2,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: 1,
            efficiency: 2,
            stamina: 3,
            maxStamina: 3,
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      state.players.p1.queue.push({
        id: 'ticket_triage_1',
        cardId: 'card_arriving_1',
        cardName: 'Chief Specialist',
        baseCost: 6,
        effectiveCost: 5,
        queuedTurn: 1,
        queueDuration: 2,
        remainingTurns: 1, // Will hit 0 at Shift Start
        influence: 3,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      // Execute Shift Start without pre-provided decision map
      executeShiftStart(state);

      // Verify engine enters pending decision state and pauses
      assert.strictEqual(state.currentPhase, 'SHIFT_START', 'Preserves SHIFT_START phase');
      assert.strictEqual(state.activePlayerId, 'p1', 'Preserves active player p1');
      assert.notStrictEqual(state.pendingDecision, null, 'Pending decision created');
      assert.strictEqual(state.pendingDecision?.type, 'CAPACITY_TRIAGE');
      assert.strictEqual(state.pendingDecision?.ticketId, 'ticket_triage_1');
      assert.strictEqual(state.pendingDecision?.allowedOptions.length, 3);

      // Verify turn CANNOT advance while decision is pending
      const advanceResult = advanceToNextPhase(state);
      assert.strictEqual(advanceResult.success, false);
      assert.match(advanceResult.error || '', /Mandatory Capacity Triage decision is pending/i);

      // Verify other actions are rejected while decision is pending
      const playAttempt = validateAction(state, {
        type: 'PLAY_CARD',
        playerId: 'p1',
        cardInstanceId: state.players.p1.hand[0].instanceId
      });
      assert.strictEqual(playAttempt.valid, false);
      assert.strictEqual(playAttempt.code, 'PENDING_DECISION_REQUIRED');

      // Reject illegal option: Reroute when hand is full (8 cards)
      while (state.players.p1.hand.length < 8) {
        state.players.p1.hand.push({ ...state.players.p1.hand[0], instanceId: `inst_fill_${state.players.p1.hand.length}` });
      }
      assert.strictEqual(state.players.p1.hand.length, 8);

      const illegalReroute = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 'ticket_triage_1',
        decision: { type: 'REROUTE_TO_HAND' }
      });
      assert.strictEqual(illegalReroute.success, false);
      assert.strictEqual(illegalReroute.code, 'HAND_FULL');
      assert.notStrictEqual(state.pendingDecision, null, 'State remains unmutated after illegal decision rejection');

      // Free a hand slot for legal reroute
      state.players.p1.hand.pop();
      assert.strictEqual(state.players.p1.hand.length, 7);

      // Legal Option 2: Reroute to hand
      const legalReroute = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 'ticket_triage_1',
        decision: { type: 'REROUTE_TO_HAND' }
      });
      assert.strictEqual(legalReroute.success, true);
      assert.strictEqual(state.pendingDecision, null, 'Pending decision cleared');
      assert.strictEqual(state.players.p1.hand.length, 8);
      assert.strictEqual(state.players.p1.pendingEscrowRefund, 5, '5 Shift escrow refund credited');

      const reroutedCard = state.players.p1.hand.find(c => c.cardDefId === 'card_arriving_1')!;
      assert.strictEqual(reroutedCard.baseCost, 6, 'Original base cost 6');
      assert.strictEqual(reroutedCard.currentCost, 6, 'Must pay full 6 Shift from hand');
      assert.strictEqual(reroutedCard.canQueueDiscount, false, 'Second queue discount prohibited');
      assert.strictEqual(reroutedCard.isReroutedFromQueue, true);

      // Now phase can advance to SHIFT_BUDGETING!
      const advanceSuccess = advanceToNextPhase(state);
      assert.strictEqual(advanceSuccess.success, true);
      assert.strictEqual(state.currentPhase, 'OPERATIONAL_ACTION');
      // In Phase 2 Budgeting, 5 Shift refund was promoted to temporary Shift
      assert.strictEqual(state.players.p1.currentShift, state.players.p1.baseShiftCapacity + 5);
    });

    it('handles Option 1 (Retire Board Unit) and triggers On Deploy', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      for (let i = 1; i <= 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_p1_unit_${i}`,
            cardDefId: `unit_${i}`,
            ownerId: 'p1',
            currentZone: 'BATTLEFIELD',
            baseCost: 2,
            currentCost: 2,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: 1,
            efficiency: 2,
            stamina: 3,
            maxStamina: 3,
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      state.players.p1.queue.push({
        id: 'ticket_retire_test',
        cardId: 'card_retire_arriving',
        cardName: 'Senior Tactician',
        baseCost: 5,
        effectiveCost: 4,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 2,
        ownerId: 'p1',
        fifoIndex: 1,
        hasOnDeployAbility: true
      });

      executeShiftStart(state);
      assert.notStrictEqual(state.pendingDecision, null);

      // Reject invalid boardUnitId
      const invalidRetire = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 'ticket_retire_test',
        decision: { type: 'RETIRE_EXISTING', boardUnitId: 'non_existent_unit' }
      });
      assert.strictEqual(invalidRetire.success, false);
      assert.strictEqual(invalidRetire.code, 'INVALID_TARGET');

      // Legal retire unit 1
      const legalRetire = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 'ticket_retire_test',
        decision: { type: 'RETIRE_EXISTING', boardUnitId: 'inst_p1_unit_1' }
      });
      assert.strictEqual(legalRetire.success, true);
      assert.strictEqual(state.players.p1.battlefield.length, 5);
      assert.strictEqual(state.players.p1.breakroom.length, 1);
      assert.strictEqual(state.players.p1.breakroom[0].cardDefId, 'unit_1');
      assert.strictEqual(state.players.p1.battlefield[4].card.cardDefId, 'card_retire_arriving');
      assert.match(legalRetire.events.join('; '), /On Deploy ability triggered/i);
    });

    it('resolves multiple arriving tickets in 4-tier order across sequential triage decisions', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      // 5 units on battlefield
      for (let i = 1; i <= 5; i++) {
        state.players.p1.battlefield.push({
          slotId: `slot_${i}`,
          card: {
            instanceId: `inst_p1_unit_${i}`,
            cardDefId: `unit_${i}`,
            ownerId: 'p1',
            currentZone: 'BATTLEFIELD',
            baseCost: 2,
            currentCost: 2,
            canQueueDiscount: true,
            isReroutedFromQueue: false,
            influence: 1,
            efficiency: 2,
            stamina: 3,
            maxStamina: 3,
            temporaryStaminaBuffer: 0,
            hasOnDeployAbility: false,
            isFrontDeskGuard: false,
            isRush: false
          },
          canAttack: false,
          enteredTurn: 1
        });
      }

      // Ticket 1 has lower influence (1)
      state.players.p1.queue.push({
        id: 't_low_inf',
        cardId: 'c_low',
        cardName: 'Junior Tech',
        baseCost: 3,
        effectiveCost: 2,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 1,
        ownerId: 'p1',
        fifoIndex: 1
      });

      // Ticket 2 has higher influence (3) -> Must resolve FIRST per 4-tier tie-breaking!
      state.players.p1.queue.push({
        id: 't_high_inf',
        cardId: 'c_high',
        cardName: 'Director',
        baseCost: 7,
        effectiveCost: 6,
        queuedTurn: 1,
        queueDuration: 1,
        remainingTurns: 0,
        influence: 3,
        ownerId: 'p1',
        fifoIndex: 2
      });

      executeShiftStart(state);

      // Verify the HIGHER influence ticket was presented first!
      assert.strictEqual(state.pendingDecision?.type, 'CAPACITY_TRIAGE');
      if (state.pendingDecision?.type === 'CAPACITY_TRIAGE') {
        assert.strictEqual(state.pendingDecision.ticketId, 't_high_inf');
      }

      // Resolve high influence ticket via Option 3 (Discard to Breakroom)
      const res1 = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 't_high_inf',
        decision: { type: 'DISCARD_TO_BREAKROOM' }
      });
      assert.strictEqual(res1.success, true);
      assert.strictEqual(state.players.p1.breakroom.length, 1);

      // Since board is still 5/5, the engine presents the SECOND ticket for triage!
      assert.notStrictEqual(state.pendingDecision, null);
      assert.strictEqual(state.pendingDecision?.type, 'CAPACITY_TRIAGE');
      if (state.pendingDecision?.type === 'CAPACITY_TRIAGE') {
        assert.strictEqual(state.pendingDecision.ticketId, 't_low_inf');
      }

      // Resolve low influence ticket via Option 2 (Reroute to Hand)
      const res2 = executeAction(state, {
        type: 'RESOLVE_TRIAGE',
        playerId: 'p1',
        ticketId: 't_low_inf',
        decision: { type: 'REROUTE_TO_HAND' }
      });
      assert.strictEqual(res2.success, true);
      assert.strictEqual(state.pendingDecision, null, 'All arriving tickets resolved');
      assert.strictEqual(state.players.p1.queue.length, 0);
    });
  });

  describe('Multi-Turn Consecutive Progression & Shift Scaling', () => {
    it('executes 3 full rounds (6 player turns) with progressive Shift scaling and clean cleanup', () => {
      const state = createInitialGameState({
        config: 'CONFIG_D',
        p1Deck: createMockDeck(),
        p2Deck: createMockDeck()
      });

      // Round 1 - P1 Turn 1
      assert.strictEqual(state.currentTurn, 1);
      assert.strictEqual(state.activePlayerId, 'p1');
      advanceToNextPhase(state); // Enters OPERATIONAL_ACTION
      assert.strictEqual(state.players.p1.baseShiftCapacity, 2);
      assert.strictEqual(state.players.p1.currentShift, 2);
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });

      // Round 1 - P2 Turn 1
      assert.strictEqual(state.currentTurn, 1);
      assert.strictEqual(state.activePlayerId, 'p2');
      advanceToNextPhase(state);
      assert.strictEqual(state.players.p2.baseShiftCapacity, 2);
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });

      // Round 2 - P1 Turn 2
      assert.strictEqual(state.currentTurn, 2);
      assert.strictEqual(state.activePlayerId, 'p1');
      advanceToNextPhase(state);
      assert.strictEqual(state.players.p1.baseShiftCapacity, 3);
      assert.strictEqual(state.players.p1.currentShift, 3);
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });

      // Round 2 - P2 Turn 2
      assert.strictEqual(state.currentTurn, 2);
      assert.strictEqual(state.activePlayerId, 'p2');
      advanceToNextPhase(state);
      assert.strictEqual(state.players.p2.baseShiftCapacity, 3);
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });

      // Round 3 - P1 Turn 3
      assert.strictEqual(state.currentTurn, 3);
      assert.strictEqual(state.activePlayerId, 'p1');
      advanceToNextPhase(state);
      assert.strictEqual(state.players.p1.baseShiftCapacity, 4);
      assert.strictEqual(state.players.p1.currentShift, 4);
      executeAction(state, { type: 'END_PHASE', playerId: 'p1' });

      // Round 3 - P2 Turn 3
      assert.strictEqual(state.currentTurn, 3);
      assert.strictEqual(state.activePlayerId, 'p2');
      advanceToNextPhase(state);
      assert.strictEqual(state.players.p2.baseShiftCapacity, 4);
      assert.strictEqual(state.players.p2.currentShift, 4);
      executeAction(state, { type: 'END_PHASE', playerId: 'p2' });

      // Enters Round 4 - P1
      assert.strictEqual(state.currentTurn, 4);
      assert.strictEqual(state.activePlayerId, 'p1');
    });
  });

});

