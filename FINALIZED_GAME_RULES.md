# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## FINALIZED GAME RULES SPECIFICATION (RULES LOCK)
**Document ID:** RULES-CANON-2026.4  
**Status:** Canonical & Locked for Engine Development  
**Effective Date:** November 2, 2026  

---

### RULE 1: MATCH OBJECTIVE AND VICTORY CONDITIONS
1.1. **Primary Victory:** A player wins immediately when their opponent's **Department Morale** drops to `0` or lower during any phase or step.  
1.2. **Concession:** A player may concede at any time on their turn.  
1.3. **Burnout Fatigue:** When a player must draw a card from an empty deck, they immediately suffer **Burnout Damage** directly to their Morale. The damage starts at 1 on the first empty draw and increments by +1 for every subsequent empty draw ($1, 2, 3, 4, \dots$).  
1.4. **Mutual Defeat:** If both supervisors drop to 0 Morale simultaneously from a symmetrical effect, the active turn player loses.

---

### RULE 2: DECK CONSTRUCTION & INITIAL GAME SETUP
2.1. **Deck Size:** Exactly **30 cards**.  
2.2. **Card Limits:** At most **2 copies** of any unique card ID per deck.  
2.3. **Opening Setup:**
- A randomized digital flip assigns **Player 1 (First Shift)** and **Player 2 (Second Shift)**.
- **Player 1** draws **4 cards**.
- **Player 2** draws **5 cards** and receives **The Master Key** (0-cost consumable: *"Gain 1 temporary Shift Hour this turn only"*). *(Note: Subject to ongoing Phase 1B exploration; experimental Config E grants 2 Master Keys)*.
- **Mulligan:** Each player may select any number of cards from their opening hand to return to their deck and draw an equal number of replacements once. Player 1 mulligans first, then Player 2. The Master Key cannot be mulliganed.
2.4. **Hand Limit:** Maximum hand size is **8 cards**. Any card drawn when a player has 8 cards is immediately discarded to the Breakroom (`zone_breakroom`).

---

### RULE 3: THE 5-PHASE TURN SEQUENCE & TIMING RESTRICTIONS
Every player's turn consists of five sequential phases. All actions occur during the active player's turn; there are no reactive interrupts during the opponent's turn in local pass-and-play.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Shift Start (Automated Maintenance & Queue Resolution)        │
│   1. All friendly characters clear 'Exhausted' status and become Ready.│
│   2. Active player's Booking Queue tickets decrement countdown by 1.   │
│   3. Any ticket with Remaining Turns == 0 enters Resolution Pipeline.  │
│      - If battlefield is full (5/5), Capacity Triage Window opens.     │
│   4. Start-of-Shift triggered abilities execute in FIFO order.         │
│   * RESTRICTION: The Master Key CANNOT be activated during Phase 1.    │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 2: Shift Budgeting (Resource Allocation)                         │
│   1. If Maximum Shift Capacity < 10, Maximum Shift increments by +1.   │
│   2. Current Shift is refilled to Maximum Shift.                       │
│   3. Any leftover temporary Shift from prior turns is cleared.         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 3: Administrative Draw                                           │
│   1. Active player draws 1 card from their deck.                       │
│   2. If deck is empty, Burnout Fatigue damage applies.                 │
│   3. If hand exceeds 8, excess card is discarded to Breakroom.         │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 4: Operational Action Phase (Main Phase)                         │
│   Active player may perform any of the following in any order:         │
│   - Deploy Characters to Front Counter (Cost <= available Shift)       │
│   - Cast Incidents (Cost <= available Shift)                           │
│   - Attach Gear to an eligible friendly Character                      │
│   - Enact a Policy (Replaces existing active Policy)                   │
│   - Submit a card to the Booking Queue (Delayed deployment discount)   │
│   - Declare Attacks with Ready Characters (Front Desk Guard enforced)  │
│   - Activate Character Abilities                                       │
│   - Activate The Master Key (Operational Action Phase ONLY)            │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 5: Shift Conclusion / Clock Out (End Phase)                      │
│   1. End-of-Shift triggers resolve.                                    │
│   2. Temporary Stamina buffs expire; Stamina clamps to base maximum.   │
│   3. State-based actions verify zero-stamina characters clock out.     │
│   4. The turn ends, locking the screen and displaying Privacy Curtain. │
└────────────────────────────────────────────────────────────────────────┘
```

#### 3.1 Master Key Timing Restriction
- **Operational Action Phase Restriction:** The Master Key may **ONLY** be activated during **Phase 4: Operational Action Phase**.
- **Prohibited Windows:** The Master Key **CANNOT** be activated during Phase 1 (Shift Start / Capacity Triage), Phase 2 (Budgeting), Phase 3 (Draw), or Phase 5 (End Phase).
- **Rationale:** Prevents manipulation of starting resource allocations before Phase 2 budgeting clears temporary energy, and prevents illegal energy injection during automated triage resolutions.

#### 3.2 Trigger Differentiation: `on_play` vs `on_deploy` / `on_enter_battlefield`
The game engine maintains an absolute architectural distinction between these trigger types:
1. **`on_play` (Cast From Hand Trigger):**
   - Triggers **ONLY** when a card is manually cast from hand by the active player paying its Shift cost during Phase 4.
   - Does **NOT** trigger when a card resolves from the Booking Queue, is summoned by another ability, or is resurrected from the Breakroom.
2. **`on_deploy` / `on_enter_battlefield` (Zone Entry Trigger):**
   - Triggers whenever a character physically enters `zone_board` (the Front Counter), regardless of origin:
     - Direct cast from hand in Phase 4.
     - Scheduled arrival from the Booking Queue in Phase 1.
     - Token generation or resurrection effects.
3. **Capacity Triage Interaction:**
   - When a resolving queued card is rerouted to hand via Capacity Triage Option 2, it does **NOT** enter the battlefield. Therefore, **`on_deploy` DOES NOT TRIGGER**.
   - `on_deploy` will trigger only later if and when the card is legitimately deployed from hand onto the battlefield.

---

### RULE 4: BOARD LAYOUT AND CAPACITY LIMITS
4.1. **Character Slots:** Exactly **5 slots** per player along the Front Counter (`zone_board`). A character cannot be deployed directly from hand if all 5 slots are occupied.  
4.2. **Policy Slot:** Exactly **1 active Policy slot** per player. Playing a new Policy automatically discards the existing Policy to the Breakroom.  
4.3. **Booking Queue Zone:** Holds up to **3 pending tickets per player**. Additional queue attempts while at capacity are rejected.  
4.4. **The Breakroom (`zone_breakroom`):** A face-up discard pile for clocked-out characters, resolved Incidents, and destroyed Gear.

---

### RULE 5: STATE-BASED ACTIONS & CAPACITY TRIAGE PROTOCOL (EXPLOIT-FREE)
State-based actions are evaluated automatically after every action and trigger:
1. **Clock Out:** Any character with current Stamina $\le 0$ immediately clocks out and moves to the Breakroom.
2. **Defeat:** Any supervisor with Morale $\le 0$ immediately loses.
3. **Orphaned Gear:** Any Gear attached to a character that leaves the counter is discarded to the Breakroom.
4. **Queue Overflow (Capacity Triage Protocol):**
   - If a queued character resolves while all 5 character slots are occupied, the active player enters the mandatory Capacity Triage Window:
     - **Option 1 (Retire Board Unit):** Choose 1 friendly board unit to retire to Breakroom; arriving card enters vacated slot and triggers `on_deploy`.
     - **Option 2 (Reroute to Hand):** Available only if $\text{Hand Size} < 8$. Card moves to hand. **CRITICAL BALANCE LOCK: Retains its calculated effective Shift cost and MUST be paid normally when subsequently played from hand.** Cannot receive a second queue discount. Does NOT trigger `on_deploy`.
     - **Option 3 (Discard to Breakroom):** Arriving card is sent directly to Breakroom. Zero battlefield triggers occur.

---

### RULE 6: FINAL SIGN-OFF SECTION

#### A. Rules Locked and Ready for Implementation
- Match objective: 30 Morale, burnout fatigue progression.
- Deck building rules: exactly 30 cards, 2-copy limit.
- 5-phase turn sequence with automated queue ticking in Phase 1 and combat in Phase 4.
- Master Key timing lock: Phase 4 only, prohibited in Phase 1 Triage.
- `on_play` vs `on_deploy` trigger differentiation.
- Exploit-free Capacity Triage Protocol with hand cap 8 and retained effective cost.

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- Starting compensation: Config D (1 Master Key) vs Config E (2 Master Keys).
- Triage timer limit in competitive matchmaking (15s default).

#### C. Features That Are Documented But Not Implemented
- Local pass-and-play Privacy Curtain full-screen transition animation.
- Advanced spectator mode camera transitions.

#### D. Remaining Questions Requiring Stakeholder Approval
- Confirmation of whether Player 2's Master Key occupies 1 of the 8 hand slots or resides in a dedicated UI token receptacle.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
