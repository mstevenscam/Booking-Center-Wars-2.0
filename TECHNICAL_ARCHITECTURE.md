# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## TECHNICAL ARCHITECTURE SPECIFICATION
**Version:** 1.0.0-ARCH  
**Status:** Canonical System Architecture  

---

### 1. HIGH-LEVEL ARCHITECTURAL OVERVIEW
The Booking Wars technical architecture is engineered around the strict principle of **Total Decoupling between the Game Engine and the User Interface**:

```
┌───────────────────────────────────────────────────────────┐
│                    REACT 19 FRONTEND                      │
│   (UI, Tailwind CSS, Motion Animations, Web Audio Synth)  │
└─────────────────────────────┬─────────────────────────────┘
                              │ Dispatches User Actions
                              │ Subscribes to State & Events
                              ▼
┌───────────────────────────────────────────────────────────┐
│             PURE TYPESCRIPT GAME ENGINE                   │
│   (/src/engine - 0 React / 0 DOM / 100% Deterministic)    │
│  - State Machine & Reducers   - Action Legality Validator │
│  - Combat Resolution Engine   - Queue & Shift Processors  │
│  - Ability Execution Stack    - Event Emitter Stream      │
└─────────────────────────────┬─────────────────────────────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
┌───────────────────────────┐ ┌─────────────────────────────┐
│    LOCAL OFFLINE CACHE    │ │   FIREBASE & GEMINI CLOUD   │
│ - Seed Card Database      │ │ - Firestore Collections     │
│ - LocalStorage Saved Decks│ │ - Firebase Storage (Images) │
│ - Pass-and-Play Memory    │ │ - Gemini Vision OCR / AI    │
└───────────────────────────┘ └─────────────────────────────┘
```

---

### 2. PURE TYPESCRIPT GAME ENGINE SUBSYSTEMS
The engine lives under `src/engine/` and has zero imports from `react`, `react-dom`, or browser DOM globals (except standard JS/TS runtime primitives).

#### 2.1 Game State Container (`GameState`)
```typescript
export interface PlayerState {
  id: 'p1' | 'p2';
  morale: number;              // Current Morale (starts at 30, defeat at <= 0)
  maxMorale: number;           // Standard 30
  baseShiftCapacity: number;   // Progressive capacity: starts at 1, max 10
  currentShift: number;        // Current spendable Shift
  temporaryShift: number;      // Ephemeral Shift (Master Key, temporary boosts)
  pendingEscrowRefund: number; // Refunds granted in Phase 1 before Phase 2 refill
  masterKeyCount: number;      // Available Master Keys (0-cost consumable: +1 temp Shift)
  fatigueCount: number;        // Burnout fatigue counter (1, 2, 3...)
  deck: CardInstance[];        // Draw pile (30-card deck)
  hand: CardInstance[];        // Hand (max 8)
  battlefield: CharacterSlot[]; // Front Counter (max 5)
  breakroom: CardInstance[];   // Graveyard / discard pile
  queue: QueuedTicket[];       // Pending Booking Queue tickets (max 3)
  ticketCounter: number;       // Monotonic ticket ID counter
}

export interface GameState {
  matchId: string;
  status: 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED';
  config: 'CONFIG_D' | 'CONFIG_E';
  currentTurn: number;
  activePlayerId: 'p1' | 'p2';
  currentPhase: 'SHIFT_START' | 'SHIFT_BUDGETING' | 'ADMINISTRATIVE_DRAW' | 'OPERATIONAL_ACTION' | 'CLOCK_OUT';
  players: {
    p1: PlayerState;
    p2: PlayerState;
  };
  result: MatchResult | null;
  historyLog: string[];
}
```

#### 2.2 Action Dispatching & Centralized Legality Verification
The UI cannot mutate state directly. All player intents are modeled as typed `GameEngineAction` envelopes:
```typescript
export type GameEngineAction =
  | { type: 'PLAY_CARD'; playerId: PlayerId; cardInstanceId: string; targetSlotIndex?: number }
  | { type: 'QUEUE_CARD'; playerId: PlayerId; cardInstanceId: string; queueDuration: number }
  | { type: 'USE_MASTER_KEY'; playerId: PlayerId }
  | { type: 'RESOLVE_TRIAGE'; playerId: PlayerId; ticketId: string; decision: TriageDecision }
  | { type: 'END_PHASE'; playerId: PlayerId }
  | { type: 'CONCEDE'; playerId: PlayerId };
```

Each action is processed through `validateAction(state, action): ActionValidationResult`. If invalid (e.g., `INSUFFICIENT_SHIFT`, `CARD_NOT_IN_HAND`, `NOT_ACTIVE_PLAYER`, `INVALID_PHASE`, `BATTLEFIELD_FULL`, `QUEUE_FULL`, `MASTER_KEY_INVALID_PHASE`), it returns `{ valid: false, code: ActionErrorCode, message: string }` and the state remains pristine. State transitions execute via `executeAction(state, action): ActionExecutionResult`.

#### 2.3 Event Stream for UI Juice & Audio
When `executeAction` produces a new state, it also generates an array of discrete event notifications:
- `CARD_SUMMONED`, `COMBAT_IMPACT`, `STAMINA_REDUCED`, `CHARACTER_CLOCKED_OUT`, `QUEUE_TICKET_ADDED`, `QUEUE_TICKET_RESOLVED`, `MORALE_CHANGED`, `TURN_STARTED`.
The React UI listens to this event stream to trigger sound synthesizers, camera shakes, floating combat numbers, and card slam animations without coupling the logic to frame timing.

---

### 3. THE PRIVACY HANDOFF CURTAIN
Because local pass-and-play is played on a single shared screen, hands must be kept confidential:
1. When Player 1 clicks **End Shift (End Turn)**, the battlefield immediately dims and locks.
2. A high-contrast **"Shift Handover - Privacy Curtain"** fills the viewport:
   - *"Turn complete for Supervisor 1. Please pass the terminal to Supervisor 2."*
   - Displays no card information, hiding both player hands.
   - Requires Player 2 to click or hold **"Assume Control & Clock In"**.
3. Once confirmed, Player 2's hand reveals with an entrance animation, Player 1's hand flips face-down, and Player 2 begins their turn.

---

### 4. CARD WORKSHOP & GEMINI AI INTEGRATION
The Card Workshop allows administrators to ingest physical card scans and create tournament-legal digital cards:

```
[Physical Card Photo (Front & Back)]
                 │
                 ▼
[File Upload / Drag & Drop in Workshop]
                 │
                 ▼
[Gemini 2.5/Flash Multimodal API Analysis]
  - Extracts Card Name, Lore, Original Joke Text
  - Transcribes Original Rules Text
  - Analyzes Visual Palette & Artwork Framing
                 │
                 ▼
[Rule Engine Compatibility Transformer]
  - Maps natural language text to structured AbilityDefinition
  - Computes recommended Shift Cost & Stat distribution via Balance Formula
                 │
                 ▼
[Card Workshop Inspection & Editor UI]
  - Admin reviews Original vs. Proposed Game Stats side-by-side
  - Admin can adjust stats, override abilities, or regenerate
                 │
                 ▼
[Admin Approval Action]
  - Card is signed, marked `isOfficial: true`, and committed to Firestore
```
