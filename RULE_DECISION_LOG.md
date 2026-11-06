# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## RULE & ARCHITECTURAL DECISION LOG
**Document ID:** DECISION-LOG-2026.4  
**Authority:** Lead Game Design Studio & Independent Audit Board  
**Version:** 1.1.0-LOCKED (Phase 1B Final Verification)  

---

### SECTION 1: APPROVED DECISIONS (CONFIRMED WITHOUT ALTERATION)

1. **Shift Capacity Progression (1 to 10):**
   - *Status:* **APPROVED**
   - *Rationale:* Evaluated across early, mid, and late game. Provides ideal 7–11 turn match pacing, predictable resource budgeting, and clear tempo milestones.
2. **Starting Department Morale (30 HP):**
   - *Status:* **APPROVED**
   - *Rationale:* Calibrated against unblocked character attack values and 30-card deck sizes; sustains a 10–15 minute match duration.
3. **Deck Construction Parameters (30 Cards, Max 2 Copies):**
   - *Status:* **APPROVED**
   - *Rationale:* Standard competitive balance between tactical consistency and deck-building variety.
4. **Battlefield Slot Capacity (5 Slots Per Player):**
   - *Status:* **APPROVED**
   - *Rationale:* Tested against 4, 6, and 7 slots. 5 slots perfectly balances board complexity, visual ergonomics, and anti-wall pacing.
5. **Persistent Character Damage:**
   - *Status:* **APPROVED**
   - *Rationale:* Damage persists across turns; characters do not heal automatically overnight. Creates meaningful combat trades and prevents board stalls.
6. **Burnout Fatigue Progression:**
   - *Status:* **APPROVED**
   - *Rationale:* Drawing from an empty deck deals 1, 2, 3, 4... escalating damage directly to Morale, ensuring decisive game conclusions.
7. **Canonical Terminology Standardization:**
   - *Status:* **APPROVED**
   - *Rationale:* Engine uses immutable internal tokens (`efficiency`, `stamina`, `character`, `breakroom`, `booking_queue`). Legacy words like "minion", "power", and "graveyard" are deprecated.

---

### SECTION 2: ADJUSTED & CLARIFIED DECISIONS (PHASE 1B AUDIT)

1. **First-Player Balance (Config D and Config E Retained as Experimental Alternatives):**
   - *Status:* **EXPERIMENTAL ALTERNATIVES — NOT DESIGNATED PERMANENTLY BALANCED**
   - *Audit Correction:* Do not designate either Config D (61.10% P1 win rate in abstract minion sim) or Config E (55.10% P1 win rate) as permanently solved.
   - *Rationale:* Abstract minion simulator does not account for Incidents, Equipment, or Queue delays. Both starting configurations remain exposed as configurable engine flags for empirical human testing during Phase 2.
2. **Booking Queue Board Overflow (Capacity Triage Protocol — Exploit Corrected):**
   - *Status:* **EXPLOIT-FREE CAPACITY TRIAGE PROTOCOL (LOCKED)**
   - *Audit Resolution:* Corrected serious exploit where rerouted cards could be deployed for 0 Shift later.
   - *Rule:*
     - Option 1 (Retire): Dismiss friendly board unit to Breakroom; arriving card enters board and triggers `on_deploy`.
     - Option 2 (Reroute to Hand): Permitted only if $\text{Hand Size} < 8$. Arriving card **retains its calculated effective Shift cost** and **MUST be paid normally** when subsequently cast from hand in Phase 4. Cannot receive a second queue discount. Does NOT trigger `on_deploy`.
     - Option 3 (Discard to Breakroom): Arriving card is sent directly to Breakroom.
3. **Booking Queue Tie-Breaking Hierarchy:**
   - *Status:* **FOUR-TIER RESOLUTION HIERARCHY (LOCKED)**
   - *Rule:*
     - Tier 1: Turn Expiration ($\text{RemainingTurns} == 0$).
     - Tier 2: Highest Influence ($I = 4 > 3 > 2 > 1$).
     - Tier 3: FIFO Queue Entry Timestamp (earlier queued turn, then lower array index).
     - Tier 4: Active Player Priority (APNAP; relevant only if external Incident causes cross-player simultaneous resolution).
4. **Master Key Timing Restriction:**
   - *Status:* **OPERATIONAL ACTION PHASE ONLY (LOCKED)**
   - *Rule:* The Master Key may only be activated during Phase 4 (Operational Action Phase). Activation during Phase 1 (Shift Start / Triage), Phase 2, Phase 3, or Phase 5 is strictly prohibited.
5. **Trigger Distinction: `on_play` vs `on_deploy`:**
   - *Status:* **ARCHITECTURALLY DIFFERENTIATED (LOCKED)**
   - *Rule:* `on_play` triggers only when manually cast from hand by paying Shift cost during Phase 4. `on_deploy` triggers whenever the unit enters `zone_board` (from hand, queue resolution, or re-summon). Rerouting from queue to hand triggers neither.
6. **Temporary Stamina Buffer Model (Option A Confirmed):**
   - *Status:* **OPTION A CONFIRMED ACROSS 10 CANONICAL EDGE CASES**
   - *Rule:* Temporary Stamina increases Current and Maximum Stamina. Damage subtracts from Current Stamina first (ablative shield). Expiration clamps current stamina to base maximum: $\min(\text{Current}, M_{\text{base}})$. Combat damage occurs in Phase 4; buff expiration in Phase 5.
7. **Dynamic Theme Extensibility:**
   - *Status:* **DYNAMIC EXTENSIBILITY CONFIRMED**
   - *Rule:* Central theme system supports arbitrary runtime theme registrations (`registerCustomTheme`) and cosmetic department classifications without engine code changes. Saved cards and decks store only immutable mechanical tokens.

---

### SECTION 3: REJECTED DECISIONS

1. **Instant-Speed Off-Turn Reactions:**
   - *Status:* **REJECTED**
   - *Rationale:* Local pass-and-play format cannot support asynchronous off-turn reaction prompts without breaking screen privacy.
2. **Influence Armor / Combat Damage Mitigation:**
   - *Status:* **REJECTED**
   - *Rationale:* Influence is strictly an administrative and queue-ordering attribute; combat survivability belongs to Stamina and Gear.
3. **Automatic Discard on Queue Board Overflow:**
   - *Status:* **REJECTED**
   - *Rationale:* Punishes players unfairly for board stalls without tactical agency. Replaced by the Capacity Triage Protocol.
4. **Zero-Cost Deployment of Rerouted Queue Cards:**
   - *Status:* **STRICTLY REJECTED AS AN UNBALANCED EXPLOIT**
   - *Rationale:* Allows degenerate holding of uncounterable zero-cost bomb units for explosive multi-card swing turns.

---

### SECTION 3: PHASE 2B COMBAT ENGINE ARCHITECTURAL DECISIONS

1. **Front Desk Guard Mandatory Targeting Enforcement:**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:* If the defending player controls one or more characters with `isFrontDeskGuard` and $\text{Stamina} > 0$, an attacker without `isInfiltration` MUST target one of the defending Guards. Direct attacks to Morale or non-guard characters are rejected with `TARGET_PROTECTED_BY_GUARD`.
2. **Infiltration Keyword Bypass:**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:* Characters possessing `isInfiltration: true` ignore defending Front Desk Guards, legally targeting non-guard units or opposing Morale directly.
3. **Deploy-Turn Attack Mechanics (Rush vs First Responder):**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:*
     - Standard character: Summoning sickness (`canAttack = false`), attacks on subsequent turns.
     - `isRush: true`: Can attack enemy characters immediately on deploy turn, but CANNOT attack Morale on that turn (`ATTACKER_CANNOT_ATTACK_MORALE`).
     - `isFirstResponder: true`: Can attack enemy characters OR Morale immediately on deploy turn.
4. **Simultaneous Combat Damage & Persistent Stamina:**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:* Both attacker and defender compute damage simultaneously based on current Efficiency. State-based action sweep removes characters with $\text{Stamina} \le 0$ to the owner's Breakroom.
5. **Rule 1.4 Mutual Defeat Resolution:**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:* If both supervisors drop to $\le 0$ Morale simultaneously, the active turn player loses.
6. **Interactive Pending Decision Targeting Architecture:**
   - *Status:* **IMPLEMENTED & VERIFIED**
   - *Rule:* Supports atomic attack execution (`DECLARE_ATTACK`) and interactive UI target selection (`INITIATE_ATTACK` -> `PendingCombatTargetDecision` -> `RESOLVE_COMBAT_TARGET`). State serialization retains pending decisions across JSON round-trips.

---

### SECTION 4: FINAL SIGN-OFF SECTION

#### A. Rules Locked and Ready for Implementation
- Turn structure (5 phases) and phase-gated permissions.
- Master Key Phase 4 timing restriction.
- `on_play` vs `on_deploy` trigger differentiation.
- Exploit-free Capacity Triage Protocol with hand cap 8, Model A full escrow refund upon reroute, and original base cost restoration.
- 4-tier Booking Queue resolution hierarchy.
- Option A Temporary Stamina Buffer mechanics.
- All 6 balance equations from `src/engine/balance.ts`.

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- Starting compensation: Config D (1 Master Key) vs Config E (2 Master Keys).
- First Responder tax calibration (3.0 vs 3.5 points).

#### C. Features That Are Documented But Not Implemented
- Symmetrical global queue acceleration Incidents.
- Dynamic cosmetic badge rendering on physical card textures.

#### D. Remaining Questions Requiring Stakeholder Approval
- None. All game laws, timing restrictions, and anti-exploit protocols are locked.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
