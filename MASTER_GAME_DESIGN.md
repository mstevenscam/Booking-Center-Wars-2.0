# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## MASTER GAME DESIGN DOCUMENT (GDD)
**Version:** 1.0.0-PROPOSAL  
**Author:** Lead Game Design & Architecture Studio  
**Status:** Foundation & Planning Stage  
**Target Platform:** Web (Desktop-first local pass-and-play, responsive)

---

### 1. Executive Summary & Vision Statement
**BOOKING WARS: The Battle for the Booking Centre** is an original, humorous, high-strategy turn-based digital collectible trading card game (CCG). Set in an exaggerated, satirical corporate-academic version of the Humber College Booking Centres, players take on the roles of rival Shift Supervisors waging bureaucratic and operational warfare for supreme authority over gear cages, reservation queues, and department resources.

While the theme celebrates eccentric workplace lore, legacy staff in-jokes, rogue AV cords, broken return policies, and panicked student film crews, the underlying mechanics offer genuine competitive depth on par with premier digital CCGs like *Hearthstone*, *Magic: The Gathering*, and *Pokémon TCG*.

---

### 2. Core Design Pillars
1. **The Bureaucracy of War (Theme & Flavor):** Every mechanic reflects office and gear-cage operational chaos: Shift Capacity, Booking Queues, Equipment Wear, Incident Reports, and Departmental Policies.
2. **Deterministic Depth over RNG Spikes:** Competitive integrity is paramount. Randomness is bounded (draw order, queue delivery order variation when specified), with victory dictated by tactical resource curve management, board tempo, and queue manipulation.
3. **Double-Edged Operational Commitments (The Shift & Queue):** Resources aren't just spent; they represent labor hours. Powerful operations can be queued for future resolution, creating transparent telegraphs that invite counterplay, priority disruption, and high-tension bluffing.
4. **Preservation of Authentic Soul:** Real-world staff caricatures, original front/back art, and historical inside jokes remain intact as the immutable canon, cleanly separated from balanced, validated competitive gameplay models.
5. **Zero-Friction Local Play:** Seamless local pass-and-play on a shared computer and display, protected by an ergonomic, tension-building "Privacy Handoff Curtain" between turns.

---

### 3. Audience, Session Scope & Pacing
- **Target Audience:** Strategy card game enthusiasts, college alumni, AV/media production workers, and casual strategy fans who appreciate workplace satire with deep mechanical substance.
- **Match Duration:** 10 to 15 minutes per match (averaging 7 to 10 turns per player).
- **Turn Timer:** Local friendly mode (untimed) / Local competitive timer (90 seconds per turn with a 15-second "Overtime" fuse).
- **Match Format:** Best-of-1 or Best-of-3 with sideboarding/deck swapping.

---

### 4. Player Anatomy & Win Conditions
- **Starting Morale (Life Total):** `30 Morale`.
  - When a player's Morale reaches `0`, their department closes down and their opponent immediately wins.
- **Starting Shift Capacity:** `1 Shift Hour` on Turn 1.
  - Increases by `+1` at the beginning of each of your turns up to a maximum cap of `10`.
  - Fully refreshes at the start of each turn.
- **Deck Parameters:**
  - Exactly `30 cards` per constructed deck.
  - Maximum `2 copies` of any unique card ID (except designated *Workplace Norms* or token cards).
- **Starting Hand:**
  - Player 1 (Going First): `4 cards`.
  - Player 2 (Going Second): `5 cards` + `The Master Key` (Special 0-cost Incident card: *"Gain 1 temporary Shift Hour this turn only"*).
- **Maximum Hand Size:** `8 cards`. Cards drawn exceeding 8 are routed to the "Recycle Bin" (discarded/burned).
- **Fatigue / Burnout Penalty:**
  - If a player attempts to draw from an empty deck, they suffer **Burnout**: lose 1 Morale on the first empty draw, 2 on the second, 3 on the third, increasing exponentially per failed draw.

---

### 5. Card Anatomy & Classifications
The game categorizes all assets into 4 card types:
1. **Characters:** The frontline staff, student workers, technicians, supervisors, and eccentric visitors. Characters occupy one of 5 battlefield slots, deal damage with Power, absorb hits with Stamina, and exercise board control with Influence.
2. **Incidents:** Fast-acting events, accidents, administrative blunders, or technical breakthroughs (e.g., *"Projector Bulb Explodes"*, *"All-Hands Meeting"*). Incidents resolve immediately upon being cast and go straight to the Audit Trail (graveyard).
3. **Equipment:** Gear, badges, tools, and tech (e.g., *"Gaffer Tape of Invincibility"*, *"Broken XLR Cable"*, *"Admin Walkie-Talkie"*). Attached to a Character to grant stat enhancements or continuous abilities. If the host Character clocks out, the Equipment is discarded unless stated otherwise.
4. **Policies:** Persistent departmental mandates played into an active Department Policy slot (1 active policy per department at a time). Alter baseline rules for both players or provide recurring end-of-turn benefits until repealed or overwritten.

---

### 6. The Four Primary Character Attributes
Every Character features four cardinal attributes:
1. **Shift Cost (1-10):** The Shift Capacity required to deploy the character to the counter.
2. **Power (0-12):** The physical or verbal combat force dealt when striking an opposing character or attacking the enemy Supervisor's Morale.
3. **Stamina (1-15):** The physical resilience and endurance of the character. When current Stamina drops to 0 or below, the character is exhausted and "Clocks Out" (sent to the Discard/Break Room).
4. **Influence (0-5):** A distinctive administrative and queue metric in Booking Wars.
   - Determines priority when interacting with the **Booking Queue** (higher Influence resolves first during simultaneous ticket deliveries).
   - Required to qualify for high-tier Department Policy mandates and to protect friendly tickets from administrative audits.
   - Low-Influence characters remain top-tier combatants without being penalized in physical trades.

---

### 7. Signature Mechanics Overview
#### A. The Shift System
Resource curve management mimicking an eight-to-ten hour operational workday. Shift Capacity expands steadily from 1 to 10. Certain cards introduce *Overtime* (paying health or incurring next-turn fatigue to overspend capacity) or *Idle Time* (carrying unspent capacity into reactive abilities).

#### B. The Booking Queue
A secondary, multi-turn staging area on the battlefield. Certain cards (deliveries, reservations, disciplinary inquiries, IT upgrades) are not resolved immediately. Instead, they are submitted to the **Booking Queue** with a countdown timer (e.g., `Queue: 2 Turns`).
- During each turn boundary, queued tickets progress toward delivery.
- Both players can visually inspect upcoming queue resolutions.
- Opponents can play specific counter-cards (e.g., *"Cancel Reservation"*, *"Lost in Transit"*, *"Wrong Barcode"*) or utilize high-Influence characters to alter ticket order, seize the shipment, or delay the resolution.

#### C. Workplace Synergies & Personality Affiliations
Cards carry distinct workplace department and personality tags:
- `Technician` (Focus on equipment tuning, repair, and direct damage).
- `Booking Specialist` (Specialists in queue manipulation, search, and hand cycling).
- `Administration` (Policies, resource acceleration, and command/control).
- `Journalism` (Investigative reveals, card draw, exposing hidden cards).
- `Production` (High power, equipment synergy, aggressive board presence).
- `Equipment Specialist` (Armor buffs, durability preservation, salvaging scrap).
- `Problem Solver` (Targeted removal, silence, debugging bugs and errors).
- `Chaos Agent` (Unpredictable effects, risk/reward gambles, morale swings).

Decks are not locked to single factions; any 30 cards may be combined, allowing multi-department deck archetypes (e.g., Tech/Admin Bureaucracy Control, Production/Chaos Aggro Swarm).

---

### 8. Architectural & Competitive Integrity Rules
1. **Separation of Art/Lore and Mechanics:** The original humor, photographs, artwork, and descriptions are honored as the permanent canon archive, while the playable game attributes are calibrated in a separate strict numerical schema.
2. **No Arbitrary AI Code:** The game engine executes strictly typed, predefined ability definitions. AI is used solely in the Card Workshop for OCR extraction and design ideation, with final approval required by a human administrator.
3. **Fully Offline Deterministic Engine:** Once the card database is loaded locally, the battle engine requires no internet connectivity, maintaining zero latency, 60fps animations, and 100% determinism.
4. **Decoupled Game Identity & Terminology Layer:** The core game engine operates exclusively on permanent internal identifiers (e.g., `shift_capacity`, `morale`, `front_desk_guard`). All visible workplace terminology, card types, and lore strings are resolved dynamically from a configurable theme definition, allowing full customization while preserving competitive mechanics (see `THEME_AND_TERMINOLOGY_SYSTEM.md`).
