# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## CARD BALANCE GUIDELINES & MATHEMATICAL DESIGN FORMULAS
**Version:** 1.0.0-BALANCE  
**Authority:** Balance & Systems Engineering  

---

### 1. THE VANILLA STAT CURVE (THE GOLD STANDARD)
In trading card game design, the **Vanilla Stat Test** establishes the baseline power of a card that features zero abilities or keywords.

For Booking Wars, the baseline stat equation for a vanilla Character is:
$$\text{Total Stat Points} = \text{Power} + \text{Stamina} = (2 \times \text{Shift Cost}) + 1$$

#### Baseline Vanilla Reference Table:
| Shift Cost | Total Stat Budget | Canonical Distribution Examples | Strategic Role |
|:---:|:---:|:---:|:---|
| 1 Shift | 3 Stats | 2/1 (Aggro) or 1/2 (Sticky) | Early board presence, gear holder |
| 2 Shift | 5 Stats | 3/2 (Trades up) or 2/3 (Defensive) | Core early-game staple |
| 3 Shift | 7 Stats | 3/4 (Standard) or 4/3 (Aggressive) | Mid-range anchor |
| 4 Shift | 9 Stats | 4/5 (The "Yeti" benchmark) or 3/6 (Wall) | Core tempo turn |
| 5 Shift | 11 Stats | 5/6 (Threat) or 4/7 (High stamina) | Mid-to-late stabilizer |
| 6 Shift | 13 Stats | 6/7 (Boss) or 5/8 | Late-game counter threat |
| 7 Shift | 15 Stats | 7/8 or 6/9 | Department leader |
| 8 Shift | 17 Stats | 8/9 | Bomb threat |
| 9-10 Shift | 19-21 Stats | 9/10 to 10/11 | Decisive battlefield champion |

---

### 2. ABILITY & KEYWORD VALUATION DEDUCTIONS
When a Character possesses keywords or special abilities, their stat budget must be penalized according to the following exchange rates (where 1 Stat Point $\approx$ 0.5 Shift Cost):

| Keyword / Trait | Stat Penalty | Shift Cost Equivalent | Design Rationale |
|:---|:---:|:---:|:---|
| **Front Desk Guard** (Taunt) | -1 Stat | ~0.5 Shift | Immediate defensive impact; protects Supervisor & high-value backline units. |
| **Rush** | -1.5 to -2 Stats | ~1.0 Shift | Immediate board interaction; acts as pseudo-removal. |
| **First Responder** (Charge) | -3 Stats | ~1.5 Shift | Extreme burst hazard to opponent Morale. Must be budgeted conservatively. |
| **Divine Lanyard** (Shield) | -2 Stats | ~1.0 Shift | Guarantees absorbing at least one high-power hit; trades favorably. |
| **Audit Immunity** (Untargetable) | -1 Stat | ~0.5 Shift | Resists removal Incidents, forcing trades on board. |
| **Draw 1 Card** (Onboarding) | -2 Stats | ~1.0 - 1.5 Shift | Replaces itself in hand, maintaining card advantage. |
| **Silence Target** (Onboarding) | -2 Stats | ~1.0 Shift | Neutralizes opponent buffs, keywords, and abilities. |
| **Clock Out (Deathrattle) Beneficial** | -1 to -2 Stats | ~0.5 - 1.0 Shift | Delayed value; vulnerable to silence or transform. |

---

### 3. THE INFLUENCE VALUATION EQUATION
Influence ($0 \le \text{Influence} \le 5$) governs Queue manipulation, priority, and resistance.
- **Influence Value:** $1 \text{ Influence Point} \approx 1.5 \text{ Stat Points}$.
- A character with 1 Influence receives no stat penalty (standard baseline).
- A character with 3 Influence must sacrifice 3 stat points from their Power/Stamina budget or cost +1 Shift.
- Characters with 4 or 5 Influence are rare and represent high-ranking administrators whose primary role is bureaucratic command rather than physical brawl.

---

### 4. THE BOOKING QUEUE DISCOUNTING FORMULA
The primary incentive to use the Booking Queue is the **Delayed Payoff Discount**:
$$\text{Effective Shift Cost} = \text{Immediate Value Cost} - (\text{Queue Turns} \times 0.75)$$

- A powerful 6-Shift threat scheduled for `Queue: 2 Turns` should only cost **4.5 (rounded to 4 or 5)** Shift upfront.
- **Risk Multiplier:** Because the opponent can anticipate the arrival, prepare counters, or play disruption cards (e.g. *"Cancel Reservation"*), queued cards are permitted to have +15% higher value upon successful resolution than cards played directly from hand.

---

### 5. INCIDENT & REMOVAL SPELL CURVES
- **Targeted Single-Target Direct Damage:**
  - Standard rate: $\text{Damage} = \text{Shift Cost} + 1$ (e.g., 2 Shift = 3 Damage; 4 Shift = 5 Damage).
  - Conditional or symmetrical damage: $\text{Damage} = \text{Shift Cost} + 2$ (e.g., deal 4 damage to damaged character for 2 Shift).
- **Hard Single-Target Removal (Destroy immediately):**
  - Standard rate: 5 Shift.
  - Conditional hard removal (e.g., "Destroy Character with 5+ Power"): 3 to 4 Shift.
- **Board Sweepers (AoE):**
  - Deal 2 damage to all enemies: 4 Shift.
  - Deal 3 damage to all characters: 5 Shift.
  - Symmetrical full wipe: 6 to 7 Shift.

---

### 6. CARD DRAW & ADVANTAGE VALUATION
- 1 Card Draw $\approx$ 1.5 Shift.
- Standard 3-Shift Incident: *"Draw 2 Cards"*.
- Standard 5-Shift Incident: *"Draw 3 Cards + Restore 2 Morale"*.

---

### 7. RARITY PHILOSOPHY: COMPLEXITY, NOT RAW POWER CREEP
1. **Student Worker (Common):** Clean, honest stat lines; foundational keywords (Front Desk Guard, Rush); intuitive effects.
2. **Shift Lead (Uncommon):** Departmental synergies (e.g., buffs other Technicians, interacts with Equipment).
3. **Supervisor (Rare):** High-utility tech cards, queue disruptors, unique build-around incentives.
4. **Department Chair (Epic):** High-variance, dramatic swing cards, powerful Policies.
5. **Dean's List (Legendary):** One copy per deck limitation recommended for select game-altering legends. Distinctive mechanics and historical Humber Booking Centre icons.
