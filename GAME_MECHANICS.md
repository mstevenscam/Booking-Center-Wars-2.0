# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## GAME MECHANICS AND SYSTEM SPECIFICATION
**Version:** 1.0.0-MECHANICS  
**Status:** Approved Reference  

---

### 1. THE SHIFT SYSTEM (RESOURCE ARCHITECTURE)
The **Shift System** governs economic tempo in Booking Wars, simulating an escalating workday of operational stress and resource availability.

#### 1.1 Progression Table
| Turn Number | Player 1 Capacity | Player 2 Capacity | Tactical Stage |
|:---:|:---:|:---:|:---|
| Turn 1 | 1 Shift | 1 (+The Master Key) | Opening Logistics (Scouts, Quick Forms) |
| Turn 2 | 2 Shift | 2 Shift | Early Checkouts & Minor Incidents |
| Turn 3 | 3 Shift | 3 Shift | Mid-Tier Technicians & First Queue Tickets |
| Turn 4 | 4 Shift | 4 Shift | Department Leads & Equipment Attachments |
| Turn 5 | 5 Shift | 5 Shift | High-Impact Incidents & Board Sweepers |
| Turn 6 | 6 Shift | 6 Shift | Senior Supervisors & Multi-Card Combos |
| Turn 7 | 7 Shift | 7 Shift | Department Chairs & Major Overhauls |
| Turn 8 | 8 Shift | 8 Shift | Late-Game Powerhouses |
| Turn 9 | 9 Shift | 9 Shift | Bureaucratic Deadlock Breakers |
| Turn 10+ | 10 Shift (Cap) | 10 Shift (Cap) | Full Operational Overtime & Finishers |

#### 1.2 Overtime Mechanics
Certain high-risk cards feature the **Overtime [X]** keyword.
- **Rule:** A player may spend more Shift than their current capacity by paying an Overtime cost (either taking Morale damage or locking an equivalent amount of Shift on their next turn).
- *Example:* A 6-cost card with `Overtime: 2 Morale` can be cast at Turn 4 by paying 4 Shift and 2 Morale.

#### 1.3 Unspent Capacity (Idle Hours)
Unlike games where unspent resources vanish without utility, in Booking Wars certain characters possess abilities that scale with unspent Shift:
- *Example:* *"Overtime Guard: Gains +1/+1 for every 2 unspent Shift Hours at the end of your turn."*

---

### 2. THE BOOKING QUEUE SYSTEM
The Booking Queue introduces a unique spatial and temporal dimension to CCG combat, capturing the real-world experience of reserving high-end cameras or studio rooms days in advance.

#### 2.1 Anatomy of a Queue Ticket
A Queue Ticket is an active record placed in the shared Booking Queue Zone:
```typescript
interface QueueTicket {
  ticketId: string;
  sourceCardId: string;
  ownerId: 'player1' | 'player2';
  turnsRemaining: number;     // e.g. 1, 2, or 3
  priorityInfluence: number;   // Calculated from caster or card spec
  title: string;              // e.g. "Arri Alexa Camera Package"
  resolutionPayload: EffectDefinition;
  isDisrupted: boolean;        // If flagged by opponent counter-ability
}
```

#### 2.2 Lifecycle of a Ticket
1. **Creation:** Cast card with `Queue: N`. Pay Shift cost immediately.
2. **Waiting Period:** Visible on the central counter. Opponents see the payload and countdown.
3. **Countdown:** During the owner's Start Phase, `turnsRemaining` decrements by 1.
4. **Resolution:** When `turnsRemaining === 0`:
   - If payload is a Character: Summons directly to the battlefield without additional cost.
   - If payload is Equipment: Attaches to target character or lands in waiting bay.
   - If payload is an Incident: Triggers effect immediately (e.g., massive board wipe or double card draw).
   - Ticket is stamped *"FULFILLED"* and sent to Audit Trail.

#### 2.3 Counterplay and Interception
- **Disruption:** Cards like *"Defective Serial Number"* or *"Double Booked"* can add +1 turn to a ticket or outright cancel it.
- **Influence Interception:** If an opponent controls a Character with Influence higher than the ticket's `priorityInfluence`, they can force a delay or redirect deliveries to their own side of the counter.

---

### 3. THE FOUR CARD TYPES
#### 3.1 Characters
- Permanent field units occupying one of the 5 Counter Slots.
- Possess: Shift Cost, Power, Stamina, Influence, and 0-2 Affiliation Tags.
- Can attack, defend, hold equipment, and activate workplace skills.

#### 3.2 Incidents
- Fast, non-permanent administrative, technical, or social crises.
- Examples: *"Coffee Machine Catastrophe"*, *"Fire Alarm Evacuation"*, *"Budget Surplus"*.
- Resolve immediately and travel to the Audit Trail.

#### 3.3 Equipment
- Physical items, badges, cables, or diagnostic tools.
- Attached to a single friendly Character.
- Provides static buffs (e.g., `+2 Power / +1 Stamina`), reactive abilities (e.g., `"Whenever host attacks, deal 1 damage to an adjacent enemy"`), or keywords (e.g., `Front Desk Guard`).
- If host clocks out, Equipment is discarded.

#### 3.4 Policies
- Long-term administrative directives occupying the department's single Policy Slot.
- Only 1 Policy active per player. Playing a new Policy replaces the old one.
- Symmetrical or asymmetrical field modifications (e.g., *"Late Fees Policy: Both players must pay 1 additional Shift to play Incidents"*).

---

### 4. CHARACTER ATTRIBUTES IN DEPTH
#### 4.1 Shift Cost (1 - 10)
Defines tempo requirement. Standard 1-drops are quick student assistants; 8-10 drops are senior campus administrators and chief technical directors.

#### 4.2 Power (0 - 12)
The offensive output of the character. Power dictates combat damage against opposing characters and direct Morale reduction against enemy Supervisors.

#### 4.3 Stamina (1 - 15)
The durability of the character.
- **Persistent Damage:** Damage is not healed at the end of the turn. An 8-Stamina unit taking 3 damage remains at 5 Stamina until healed by a card effect (e.g., *"First Aid Kit"*, *"Cafeteria Break"*).
- When Stamina reaches 0, the character clocks out.

#### 4.4 Influence (0 - 5)
A strategic administrative attribute in Booking Wars:
- **Queue Priority:** During simultaneous queue deliveries, the ticket scheduled with the highest Influence resolves first.
- **Queue Interception & Protection:** Interacting with or auditing an opponent's reservation requires Influence equal to or greater than the ticket's priority. High-Influence characters also protect friendly tickets from cancellation.
- **Policy Enforcement:** Advanced Department Policies require a minimum combined field Influence threshold to activate.
- **Low-Influence Role:** Low-Influence characters (e.g. 0 or 1) remain premier physical combatants without suffering penalties in combat damage trades.

---

### 5. WORKPLACE AFFILIATIONS (PERSONALITY TAGS)
Characters can have 1 or 2 Affiliations, forming rich deck archetypes:

1. **Technician:** Masters of wiring, maintenance, and hardware. Specialize in direct damage, equipment buffs, and fixing disrupted gear.
2. **Booking Specialist:** Customer service masters. Specialize in search mechanics, queue acceleration, hand management, and ticket manipulation.
3. **Administration:** Bureaucrats and managers. Specialize in Policies, resource generation, card advantage, and enforcing rules on opponents.
4. **Journalism:** Inquisitive investigators. Specialize in revealing opponent hand cards, predicting draws, and disabling abilities via public exposure.
5. **Production:** Film, audio, and TV crews. Specialize in heavy Power, burst damage, high tempo, and aggressive counter pushes.
6. **Equipment Specialist:** Heavy warehouse and cage specialists. High Stamina, Front Desk Guard, and salvaging discarded equipment.
7. **Problem Solver:** Tactical troubleshooters. Specialize in silence effects, removing debuffs, and flexible situational responses.
8. **Chaos Agent:** Eccentric disruptors, rogue students, and unexpected visitors. High variance, random targets, and wild board-state transformations.
