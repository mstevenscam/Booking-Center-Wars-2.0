# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## OFFICIAL RULEBOOK (COMPETITIVE STANDARD)
**Document ID:** RULEBOOK-STD-2026.1  
**Authority:** Official Rulebook & Competitive Operations Committee  
**Version:** 1.0.0-CANON  

---

### RULE 1: OBJECTIVE AND VICTORY CONDITIONS
1.1. **Primary Victory:** A player wins the match instantly when their opponent's **Morale** drops to `0` or lower during any phase or step.  
1.2. **Concession:** A player may concede at any time on their turn when no action is actively resolving.  
1.3. **Mutual Morale Loss:** If both players' Morale drops to 0 or lower simultaneously (e.g., from an Incident dealing symmetrical damage), the active turn player loses, unless an explicit tiebreaker card rule states otherwise.  
1.4. **Deck Depletion (Burnout):** There is no immediate loss for having 0 cards remaining in your deck. However, each time a player must draw a card from an empty deck, they immediately suffer **Burnout Damage** directly to their Morale. Burnout begins at 1 damage on the first empty draw and increases by +1 for each subsequent empty draw (1, 2, 3, 4, etc.).

---

### RULE 2: MATCH SETUP & INITIAL STATE
2.1. **Deck Construction:**
- A legal deck contains exactly **30 cards**.
- A deck may contain at most **2 copies** of any single card ID.
- Up to 1 **Policy Card** may be in play for each player at any given time.

2.2. **Determining First Turn:**
- A coin toss or randomized digital roll determines Player 1 (First Shift) and Player 2 (Second Shift).

2.3. **Opening Hand & The Mulligan:**
- **Player 1** draws **4 cards**.
- **Player 2** draws **5 cards** and receives **The Master Key** (0-cost Incident: *"Gain 1 temporary Shift Hour this turn only"*).
- **Mulligan Procedure:** Each player may select any number of cards from their opening hand to shuffle back into their deck once, drawing an equal number of fresh cards. Player 1 mulligans first, followed by Player 2.

2.4. **Board Capacity:**
- Each player has **5 Character Slots** on their side of the Service Counter (Battlefield). A player cannot summon or deploy a Character if all 5 slots are occupied, unless an active Character is first retired or replaced by a card effect.
- Each player has **1 Active Policy Slot**.
- Both players share access to the centralized **Booking Queue**, which accommodates up to 4 pending ticket reservations per player.

---

### RULE 3: TURN STRUCTURE AND PHASE ORDER
Every player's turn consists of five sequential phases:

```
[Phase 1: Shift Start] 
   └── Unexhaust Characters; Trigger "Start of Turn" effects; Process Queue countdowns
[Phase 2: Shift Budgeting] 
   └── Maximum Shift Capacity increments by +1 (up to 10); Refills current Shift to Maximum
[Phase 3: Administrative Draw] 
   └── Active player draws 1 card from their deck (burnout applies if deck is empty)
[Phase 4: Counter Action (Main Phase)] 
   └── Play Characters, Incidents, Equipment, Policies; Declare attacks; Activate abilities
[Phase 5: Clock Out (End Phase)] 
   └── Trigger "End of Turn" effects; Clear temporary combat buffs; Handover to Opponent
```

#### Detailed Phase Breakdown:
- **Phase 1: Shift Start (Untap & Ticket Check)**
  - All Characters on the active player's side remove their "Exhausted" (Fatigued/Tapped) status and become "Ready".
  - Any tickets in the active player's **Booking Queue** with `Remaining Turns = 1` immediately resolve their scheduled payload in priority order (oldest queue index first).
  - All other tickets in the active player's Booking Queue decrement their remaining counter by 1.
  - "Start of Shift" abilities on active cards trigger and resolve.

- **Phase 2: Shift Budgeting (Resource Allocation)**
  - If the active player's Maximum Shift Capacity is less than 10, it increases by 1.
  - Current Shift Capacity is refilled to the player's new Maximum Shift Capacity.
  - Any unspent temporary capacity from previous turns is wiped.

- **Phase 3: Administrative Draw**
  - Active player draws 1 card into their hand. If hand size is currently at 8 (the Hand Limit), the drawn card is immediately burned to the Audit Trail.

- **Phase 4: Counter Action (Main Phase)**
  - The active player can perform any of the following actions in any order, as long as they have sufficient Shift Capacity:
    1. **Deploy Character:** Pay Shift Cost to place a Character into an empty slot. Summoned characters enter in an *Unprepared* state ("Onboarding") and cannot attack on the turn they are deployed unless they possess **Rush** or **First Responder**.
    2. **Cast Incident:** Pay Shift Cost, declare targets (if required), execute card text, and discard to the Audit Trail.
    3. **Attach Equipment:** Pay Shift Cost to attach gear to an eligible active Character.
    4. **Enact Policy:** Pay Shift Cost to play a Policy into the Policy slot. If an existing Policy was active, the older policy is repealed (discarded).
    5. **Declare Attacks:** Select a Ready Character to attack an opposing Character or the opposing Supervisor's Morale.
    6. **Activate Abilities:** Pay the activation cost of an active Character or Policy.

- **Phase 5: Clock Out (End Phase)**
  - "End of Shift" triggered effects resolve.
  - Damage marked on Characters remains (Damage in Booking Wars is **Persistent** across turns until explicitly healed or repaired).
  - Temporary stat modifiers stating *"this turn only"* expire.
  - The turn concludes, triggering the **Privacy Handoff Curtain** before Player 2 assumes control.

---

### RULE 4: COMBAT SYSTEM AND DAMAGE RESOLUTION
4.1. **Eligibility to Attack:**
- A Character must be **Ready** (not exhausted) and not suffering from **Onboarding Sickness** (must have been under the player's control since the start of their current turn, unless they have the **Rush** keyword).

4.2. **Targeting Declaration:**
- An attacking Character may target:
  - Any opposing Character on the battlefield; OR
  - The opposing Supervisor (Direct Morale Attack), PROVIDED that the opponent has NO Characters with the **Front Desk Guard** keyword currently active.

4.3. **Front Desk Guard (Taunt):**
- If an opponent controls one or more Characters with **Front Desk Guard**, the active player CANNOT attack the opposing Supervisor directly, nor can they attack any opposing Character without Front Desk Guard. They MUST target an active Front Desk Guard.

4.4. **Simultaneous Damage Resolution:**
- When an attacking Character strikes a defending Character:
  - The Attacker deals its **Power** as damage to the Defender's Stamina.
  - The Defender SIMULTANEOUSLY deals its **Power** as damage to the Attacker's Stamina.
  - *Example:* Attacker (Power 3, Stamina 4) attacks Defender (Power 2, Stamina 3).
    - Defender takes 3 damage -> Current Stamina = 0 -> Clocks Out (Dies).
    - Attacker takes 2 damage -> Current Stamina = 2 -> Survives with persistent wound.

4.5. **Direct Attack on Supervisor:**
- When attacking the opposing Supervisor's Morale directly:
  - The target Supervisor loses Morale equal to the attacking Character's **Power**.
  - The attacking Character takes no retaliation damage (Supervisors do not possess inherent Power unless equipped with a specialized defensive mandate).

4.6. **Persistent Stamina Damage:**
- Unlike games where damage resets at end of turn, in Booking Wars **damage is permanent**. A 5-Stamina Character that takes 3 damage remains at 2 Stamina going into subsequent turns.

---

### RULE 5: THE BOOKING QUEUE TIMING AND RESOLUTION
5.1. **Queue Staging:**
- Certain cards feature the **Queue [N]** keyword (e.g., `Queue: 2 Turns`).
- When played, the player pays the initial Shift Cost immediately.
- The card is placed into the player's active **Booking Queue Staging Zone** with a countdown token of `[N]`.
- The card is visible to both players.

5.2. **Queue Countdown and Execution:**
- At the start of the owner's turn (Phase 1), ticket timers decrement by 1.
- When a ticket's timer reaches `0`, its payload triggers and executes automatically. If it summons a Character, the Character appears in an available slot; if it is an Incident/Delivery, its effect resolves.

5.3. **Queue Disruption & Cancellation:**
- Opponents can interact with pending tickets in the queue using specific cards (e.g., *"Audit Notice"*, *"Equipment Cancelled"*) or characters with Influence >= 3.
- If a ticket is canceled or confiscated before countdown reaches 0, its payload is negated and discarded to the Audit Trail without refunding original Shift cost.

---

### RULE 6: STATE-BASED ACTIONS (SBA)
6.1. State-based actions are evaluated continuously whenever a player would receive priority or an action concludes:
- Any Character with `Current Stamina <= 0` immediately **Clocks Out** and is moved to the Audit Trail.
- Any Supervisor with `Current Morale <= 0` is defeated immediately.
- Any Equipment attached to an invalid or departed Character is discarded to the Audit Trail.
- If a player controls more than 5 Characters, they must immediately choose and discard down to 5.
