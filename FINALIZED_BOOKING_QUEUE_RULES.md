# FINALIZED BOOKING QUEUE RULES & LIFECYCLE
## Booking Wars: The Battle for the Booking Centre — Rules Lock Specification

---

### 1. Booking Queue Core Architecture

The Booking Queue (`zone_booking_queue`) represents delayed equipment preparation, scheduled logistics, and dispatched staff shifts.
By scheduling a card into the Booking Queue rather than deploying it directly to the battlefield (`zone_board`), the player pays a discounted Shift Cost upfront in exchange for a delay of $T$ turns.

#### Core Parameters:
- **Maximum Queue Capacity:** Strict maximum of **3 pending tickets** per player. If a player already has 3 active tickets in their queue, they cannot queue additional cards until a slot clears.
- **Maximum Queue Duration:** $T \in \{1, 2, 3, 4\}$ turns.
- **Minimum Shift Cost Floor:** Strict minimum of **1 Shift**. Effective cost can never be reduced to 0 or negative numbers through queuing:
  $$\text{EffectiveQueueCost} = \max\Big(1, \text{round}\big(\text{ImmediateCost} - (\text{QueueTurns} \times 0.75)\big)\Big)$$
- **Visibility:** Open public zone. Both players can inspect the card name, cost, remaining turns, and Influence of all queued tickets at all times.

---

### 2. Turn-Start Countdown & Resolution Sequence

1. **Step 1 (Tick Countdown):** At the start of a player's turn (during **Phase 1: Shift Start**), every ticket in that player's Booking Queue decrements its remaining turns counter by 1:
   $$\text{RemainingTurns} = \text{RemainingTurns} - 1$$
   *(Note: A player's queue ticks down ONLY on their own turn).*
2. **Step 2 (Identification of Resolving Tickets):** Any ticket whose remaining turns reaches `0` is marked for immediate resolution.
3. **Step 3 (Tie-Breaking Ordering):** If multiple tickets reach 0 simultaneously, they are ordered according to the strict four-tier tie-breaking algorithm below.
4. **Step 4 (Deployment & On-Deploy Triggers):** Each resolving ticket moves from the Queue to the Battlefield (`zone_board`), triggering any `on_deploy` abilities.

---

### 3. Strict 4-Tier Booking Queue Tie-Breaking Hierarchy

When multiple tickets are scheduled to resolve on the same turn, resolution order is determined by this four-tier hierarchical algorithm:

```
Step 1: Check Turn Expiration (RemainingTurns == 0)
   │
   ▼
Step 2: Highest Influence First (Influence: 4 > 3 > 2 > 1)
   │ (If Influence is tied)
   ▼
Step 3: FIFO Queue Timestamp (Ticket Queued Earlier Resolves First)
   │ (Lower queue array index / older ticket creation turn)
   ▼
Step 4: Active Player Priority (APNAP)
   (In rare cases where an Incident forces cross-player resolution,
    Active Player's tickets resolve before Inactive Player's tickets)
```

#### Detailed Explanation:
- **Priority Tier 1 (Turn Expiration):** Only tickets whose counters reach 0 are processed.
- **Priority Tier 2 (Highest Influence):** Characters with higher managerial/departmental authority take precedence in dispatching to the counter. A card with Influence 4 resolves before Influence 3, which resolves before Influence 2, etc.
- **Priority Tier 3 (FIFO / Ticket Creation Timestamp):** If two resolving characters have identical Influence, the character that was entered into the queue earlier (lower index in the queue array or earlier queued turn) resolves first.
- **Priority Tier 4 (Active Player Priority / Cross-Player Resolution Reality):** In standard gameplay, each player's queue ticks down strictly during their own **Phase 1: Shift Start**, meaning simultaneous cross-player ticket resolution does NOT occur during normal turn transitions. However, if a symmetrical Incident card (e.g. *"System-Wide Firmware Reboot"*) advances queue countdowns for both players simultaneously, Tier 4 enforces **Active Player First (APNAP)**: all resolving tickets of the active player resolve completely before any resolving tickets of the inactive player are processed.

#### Worked Examples With 3 Simultaneous Tickets

**Scenario A: 3 Tickets Reaching 0 on Turn 4**
- `Ticket A`: Queued on Turn 2, Cost 4, **Influence 2**
- `Ticket B`: Queued on Turn 3, Cost 3, **Influence 3**
- `Ticket C`: Queued on Turn 2, Cost 5, **Influence 2** (queued after Ticket A on Turn 2)

*Resolution Execution:*
1. **First:** `Ticket B` resolves because it has **Influence 3** (higher than A and C's Influence 2).
2. **Second:** Between `Ticket A` and `Ticket C`, both have Influence 2. Because `Ticket A` was entered into the queue earlier than `Ticket C` on Turn 2, **FIFO** dictates that `Ticket A` resolves second.
3. **Third:** `Ticket C` resolves third.

**Scenario B: 3 Tickets All With Identical Influence (All Influence 1)**
- `Ticket 1`: Queued on Turn 1 (Remaining: 3 $\rightarrow$ resolves T4)
- `Ticket 2`: Queued on Turn 2 (Remaining: 2 $\rightarrow$ resolves T4)
- `Ticket 3`: Queued on Turn 3 (Remaining: 1 $\rightarrow$ resolves T4)

*Resolution Execution:*
1. All three have Influence 1.
2. FIFO applies strictly by entry timestamp:
   - `Ticket 1` resolves first (oldest ticket).
   - `Ticket 2` resolves second.
   - `Ticket 3` resolves third.

---

### 4. Resolution of Board Overflow: Corrected Capacity Triage Protocol (Exploit-Free)

#### The Exploit Identified & Corrected
In prior documentation iterations, a severe design loophole existed: if an arriving queued card was rerouted to hand when the battlefield was full (5/5), it was suggested that the card could be deployed from hand later for **0 Shift**. This created an uncounterable exploit: players could intentionally saturate their board with cheap tokens, queue heavy 6-cost or 7-cost bombs, bounce them to hand via queue overflow, and unleash massive zero-cost tempo swing turns that broke the game balance.

#### The Corrected Rule (Model A Refund Architecture):
1. **Full Escrow Refund Upon Reroute:** When an arriving queued card is rerouted to hand via Option 2, the exact discounted Shift amount paid when queued (e.g. 5 Shift) is **immediately and fully refunded** to the player's available Shift pool.
2. **Restoration of Original Base Cost:** The rerouted card returns to hand at its **original base Shift cost** (e.g. 6 Shift for *SWAT Lead*). When played from hand during Phase 4, the player MUST pay this full original base cost.
3. **Zero Second Discount:** A rerouted card is flagged (`canQueueDiscount = false`). It can never receive a second Booking Queue discount.
4. **No Deploy Triggers on Reroute:** Rerouting a card to hand does **NOT** trigger `on_deploy` abilities or count as a card play. `on_deploy` triggers only when the card physically enters the Front Counter battlefield.
5. **Hand Cap Enforcement & Atomicity:** Rerouting respects the hard hand cap of **8 cards**. If the player's hand currently contains 8 cards, Option 2 is strictly disabled. If attempted, the operation aborts atomically: zero refund is granted, the ticket remains in the queue, and hand size remains 8.
6. **Breakroom Option Preserved:** Option 3 (direct send to Breakroom) remains fully available if the player prefers not to dismiss active battlefield units and cannot or chooses not to add to hand. Zero refund is granted on discard.

#### The Three Canonical Triage Choices:

1. **Option 1: Retire an Existing Character to Breakroom (`action_retire`)**
   - The player selects 1 existing friendly Character on their battlefield to dismiss to the Breakroom.
   - The chosen character leaves the board (triggering standard `on_retire` / `on_clock_out` triggers).
   - The arriving queued Character immediately enters the newly vacated slot, triggering its `on_deploy` ability.
   - Zero additional Shift is paid; zero refund is granted.

2. **Option 2: Re-route Arriving Character to Hand (`action_reroute_to_hand`)**
   - Requires: $\text{Hand Size} < 8$.
   - **Escrow Refund:** The full amount paid upfront (effective queue cost) is refunded to the player's Shift pool.
   - **Restored Cost:** The arriving Character enters hand at its original base Shift cost (e.g. 6 Shift).
   - **Subsequent Deployment:** Can only be played from hand during Phase 4 by spending the original base Shift cost and only if a board slot is available.
   - **No On Deploy Trigger:** Rerouting does NOT trigger `on_deploy`.
   - **No Second Discount:** Cannot be re-queued for another discount.

3. **Option 3: Discard Arriving Character to Breakroom (`action_discard_to_breakroom`)**
   - The arriving Character is sent directly to the Breakroom.
   - Zero battlefield entry triggers occur; zero refund is granted.
   - Mandatory if board is 5/5, hand is 8/8, and player declines Option 1.

#### Worked Examples:
- **Worked Example 1 (Model A Canonical 5-Phase Turn Sequence & Accounting):**  
  - *Turn 4:* Player queues *Senior Coordinator* (Base Cost 6) for 2 turns, paying $\max(1, \text{round}(6 - 1.5)) = 5$ Shift upfront.  
  - *Turn 6 Start:* Player enters turn with 0 unspent Shift (Turn 5 unspent Shift expired at Turn 5 Clock Out), board at 5/5, hand at 3 cards, and base capacity 6.  
  - *Phase 1 (Shift Start & Queue Triage):* Countdown decrements $1 \rightarrow 0$. Board is full (5/5). Player selects Option 2 (Reroute to Hand). *Senior Coordinator* moves to hand at its **original base cost of 6 Shift** with `canQueueDiscount = false`. The 5 Shift paid on Turn 4 is refunded as an escrow credit (`pendingEscrowRefund = 5`, `shiftHours = 5`).  
  - *Phase 2 (Shift Budgeting):* Turn 6 base capacity is established at 6 Shift. Base allocation is refilled and the Phase 1 escrow refund is promoted to active temporary Shift. Spendable balance: $6\text{ (Base Allocation)} + 5\text{ (Escrow Refund)} = \mathbf{11\text{ Shift}}$.  
  - *Phase 3 (Administrative Draw):* Player draws 1 card from deck. Hand size becomes 5 (3 initial + 1 rerouted + 1 drawn). Shift balance remains **11 Shift**.  
  - *Phase 4 (Operational Action Phase):* After a combat exchange frees a board slot (5 -> 4 units), player plays *Senior Coordinator* from hand for its full base cost of 6 Shift. Spendable Shift drops from 11 to $11 - 6 = \mathbf{5\text{ Shift remaining}}$. Unit enters board and triggers its On Deploy ability.  
  - *Phase 5 (Clock Out):* Temporary Shift expires and remaining unspent 5 Shift clears to 0, cleanly resetting the resource pool for Turn 7 refill.  
  - *Net Accounting:* Player paid 5 Shift on Turn 4, received 5 Shift refund on Turn 6, and paid 6 Shift to deploy. Net Shift spent across the entire lifecycle: $5 - 5 + 6 = \mathbf{6\text{ Shift}}$. The player forfeited the 1-Shift queue discount due to counter congestion, was not double-charged 10 Shift, and could not hoard 0-cost cards.
- **Worked Example 2 (Full Hand Constraint & Atomicity):** Player has 5 board units and 8 hand cards. A queued ticket reaches 0. Option 2 is disabled because hand is full. If player attempts Option 2, the operation aborts with zero resource modification. Player must either dismiss a board unit (Option 1) to seat the arriving card, or discard the arriving card to the Breakroom (Option 3).

---

### 5. Final Sign-Off Section

#### A. Rules Locked and Ready for Implementation
- Booking Queue capacity: strict max 3 tickets per player.
- Queue duration: 1 to 4 turns.
- Queue discount formula: $\max(1, \text{round}(\text{ImmediateCost} - (\text{QueueTurns} \times 0.75)))$.
- 4-tier tie-breaking resolution hierarchy: Expiration -> Highest Influence -> FIFO -> APNAP.
- Capacity Triage Protocol with retained effective cost, zero free deployment exploit, and hand cap of 8.

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- Triage window timeout duration (15 seconds default in digital ranked; configurable in casual/AI matches).
- Animation durations for ticket countdown decrement and queue drawer transitions.

#### C. Features That Are Documented But Not Implemented
- Symmetrical global Incidents that trigger simultaneous cross-player queue decrements outside standard turn order.
- Targeted Incident cards that sabotage, freeze, or accelerate opponents' queue tickets.

#### D. Remaining Questions Requiring Stakeholder Approval
- None. All queue lifecycle mechanics, tie-breaking rules, and triage anti-exploit protocols are mathematically and logically locked.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
