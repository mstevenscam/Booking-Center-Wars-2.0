# FINALIZED COMBAT & DAMAGE RESOLUTION RULES
## Booking Wars: The Battle for the Booking Centre — Rules Lock Specification

---

### 1. Canonical Combat Mechanics & Internal Identifiers

To prevent semantic confusion, combat logic is executed exclusively using immutable internal tokens:
- `efficiency`: The numeric damage output dealt by a character in combat.
- `stamina`: The numeric durability/health pool of a character.
- `keyword_front_desk_guard`: Defensive priority keyword requiring attackers to target this unit before non-guards or the player's Morale.
- `keyword_first_responder`: Can attack any target (characters or enemy Morale) on the turn it enters the board.
- `keyword_rush`: Can attack enemy characters (NOT enemy Morale) on the turn it enters the board.
- `keyword_infiltration`: Bypasses `keyword_front_desk_guard`, allowing the attacker to target any valid enemy character or Morale.

---

### 2. Combat Declaration & Targeting Laws

1. **Targeting Legality:**
   - When declaring an attack, the active player checks the defending player's battlefield for active characters possessing `keyword_front_desk_guard` with $\text{Stamina} > 0$.
   - **Mandatory Guard Enforcement:** If one or more Front Desk Guards exist, an attacker WITHOUT `keyword_infiltration` MUST target one of the defending Front Desk Guards. Direct attacks to non-guard characters or the enemy Supervisor's Morale are ILLEGAL and rejected by the engine validator.
   - **Multiple Guards:** If multiple Front Desk Guards are present, the attacking player may choose which Front Desk Guard to attack.
   - **Infiltration Exception:** An attacker possessing `keyword_infiltration` ignores all Front Desk Guards and may directly target any non-guard character or enemy Supervisor Morale.
2. **Simultaneous Combat Damage Resolution:**
   - When an attacking character battles a defending character, **both units deal damage simultaneously** equal to their current Efficiency:
     $$\text{Defending Character Stamina} = \text{Defending Character Stamina} - \text{Attacking Character Efficiency}$$
     $$\text{Attacking Character Stamina} = \text{Attacking Character Stamina} - \text{Defending Character Efficiency}$$
3. **State-Based Death Sweep (Clocking Out):**
   - Immediately following damage assignment, a State-Based Action (SBA) check sweeps the board.
   - Any character with $\text{Stamina} \le 0$ is clocked out and sent to the Breakroom (`zone_breakroom`).
   - If both characters reach $\le 0$ Stamina, both clock out simultaneously.

---

### 3. Temporary Stamina Buffer Engine (Option A Specification)

#### Canonical Principles (Option A: Health Buffer Model)
1. **Application:** A temporary Stamina buff of $+X$ increases both **Current Stamina** and **Maximum Stamina** by $X$.
2. **Ablative Buffer Behavior:** When the character takes damage, damage is subtracted from Current Stamina first. The temporary $+X$ Stamina acts as an ablative shield, absorbing incoming damage before base stamina is compromised.
3. **Healing Integration:** Healing can restore lost stamina up to the current augmented maximum stamina.
4. **Turn-End Expiration & Clamping:** At the end of the specified duration (during **Phase 5: End-of-Shift / Turn Cleanup**), the buff expires. Maximum Stamina returns to base maximum ($M_{\text{base}}$), and Current Stamina is clamped:
   $$\text{Stamina}_{\text{end}} = \min(\text{Current Stamina}, M_{\text{base}})$$
5. **Permanent Increases Persist:** Permanent modifiers (from Gear attachments or permanent promotion Incidents) increase base maximum stamina and are fully preserved when temporary buffs expire.
6. **Clock Out Check:** If current stamina reaches 0 or less at any point (during combat or otherwise), the character clocks out immediately via SBAs.
7. **Phase-Separated Timing Law:**
   - Combat damage is calculated and applied strictly during **Phase 4: Operational Action Phase (Combat)**.
   - Temporary buff expiration and stamina clamping occur strictly during **Phase 5: End-of-Shift (Turn Cleanup)**.
   - Because of this strict phase separation, an intact character with $1$ stamina surviving combat does NOT suffer retroactive death when a $+2$ temporary buff expires at turn end.

---

### 4. Edge-Case Matrix: 10 Canonical Scenarios

The following 10 edge cases have been mathematically analyzed and verified with automated unit tests in `/src/engine/tests/stamina_buffer.test.ts`:

#### Edge Case 1: Multiple Temporary Stamina Buffs (Stacking)
- **Scenario:** A 4/4 character receives $+2$ temporary stamina from "Coffee Run" and $+3$ temporary stamina from "Overtime Adrenaline".
- **Resolution:** Buffs stack additively. Current stamina becomes $4 + 2 + 3 = 9$. Effective maximum becomes $4 + 5 = 9$.

#### Edge Case 2: Staggered Expiration Across Multiple Turns
- **Scenario:** A 5/5 character receives Buff A ($+2$ for 1 turn) and Buff B ($+4$ for 2 turns). Total $= 11/11$. Takes no damage.
- **Resolution:**
  - *End of Turn 1:* Buff A expires. Max reverts to $5 + 4 = 9$. Current clamps to $9/9$.
  - *End of Turn 2:* Buff B expires. Max reverts to $5$. Current clamps to $5/5$.

#### Edge Case 3: Permanent Stamina Increases While Temporarily Buffed
- **Scenario:** A 4/4 character has a $+3$ temp buff ($7/7$). The player attaches a permanent Gear granting $+2$ Stamina.
- **Resolution:**
  - Permanent modifier updates base max: $M_{\text{base}} = 4 + 2 = 6$.
  - Current stamina becomes $7 + 2 = 9$. Effective max $= 6 + 3 = 9$.
  - *End of Turn:* Temp buff ($+3$) expires. Max reverts to $6$. Current clamps to $\min(9, 6) = \mathbf{6/6}$. The permanent $+2$ is fully preserved.

#### Edge Case 4: Healing While Temporarily Buffed
- **Scenario:** A 5/5 character takes 3 damage $\rightarrow$ $2/5$. Receives $+4$ temp buff $\rightarrow$ $6/9$. Player heals it for $+2$ $\rightarrow$ $8/9$.
- **Resolution:** Healing restores lost stamina up to the augmented maximum of 9.
  - *End of Turn:* Temp buff expires ($M_{\text{base}} = 5$). Current stamina (8) clamps to $\min(8, 5) = \mathbf{5/5}$. The character is restored to full health.

#### Edge Case 5: Damage During Temporary Buffs (Ablative Shielding)
- **Scenario A:** A 4/4 character receives $+3$ temp stamina ($7/7$). Takes 2 damage $\rightarrow$ $5/7$.
  - *End of Turn:* Buff expires ($M_{\text{base}} = 4$). Current stamina (5) clamps to $\min(5, 4) = \mathbf{4/4}$. The temporary buffer completely absorbed the 2 damage; base health is 100% intact.
- **Scenario B:** A 4/4 character receives $+2$ temp stamina ($6/6$). Takes 5 damage $\rightarrow$ $1/6$.
  - *End of Turn:* Buff expires ($M_{\text{base}} = 4$). Current stamina is 1. Since $1 \le 4$, current stamina remains $\mathbf{1/4}$. The buffer absorbed 2 damage, and 3 damage cut into base health.

#### Edge Case 6: Temporary Stamina Debuffs
- **Scenario:** A 6/6 character suffers a $-2$ temporary stamina debuff from "Flu Outbreak" $\rightarrow$ $4/4$. Takes 1 damage $\rightarrow$ $3/4$.
- **Resolution:**
  - *End of Turn:* Debuff expires. Max stamina reverts to 6. Current stamina remains $3/6$. (Debuff expiration restores maximum capacity, but does not heal damage taken).

#### Edge Case 7: Transformations (Demotion)
- **Scenario:** A 4/4 character has $+4$ temp stamina ($8/8$). An Incident transforms it into a "Demoted Intern" (1/1).
- **Resolution:** Transformation replaces the character entity with a fresh template. All temporary buffs, debuffs, permanent modifiers, and damage counters are cleared immediately. Current and Max become $1/1$.

#### Edge Case 8: Returning to Hand (Recall)
- **Scenario:** A 5/5 character with $+3$ temp buff takes 4 damage ($4/8$). Returned to hand by an ability.
- **Resolution:** A card returned to hand is reset to its base card template. All temporary buffs and wound counters are purged. When inspected in hand, it is a normal 5/5 card.

#### Edge Case 9: Re-summoning
- **Scenario:** A character bounced to hand in Edge Case 8 is deployed to the battlefield again.
- **Resolution:** Enters the battlefield as a fresh instance with base stats ($5/5$), ready to receive new buffs.

#### Edge Case 10: Simultaneous Damage and Buff Expiration Sequencing
- **Scenario:** A 3/3 character with $+2$ temp stamina ($5/5$) battles an enemy with 4 Efficiency during combat.
- **Resolution:**
  - *Combat Phase:* 4 damage is inflicted immediately $\rightarrow$ character drops to $1/5$ Stamina. Because $1 > 0$, the character survives the Combat Phase.
  - *End of Shift Phase:* Temporary buff expires. Max reverts to 3. Current stamina is 1 ($\le 3$), so character survives as $1/3$. The character does NOT die when the buff fades.

---

### 5. Stacking Exploit Safeguards

To prevent degenerately stacking cheap temporary buffs:
1. **Linear Valuation:** Each $+1$ temporary stamina costs 1.0 stat point (~0.5 Shift).
2. **Buffer Slot Constraint:** Characters can hold a maximum of **2 active temporary stamina buffs** simultaneously. Any additional temporary stamina buff applied replaces the oldest active temporary buff.

---

### 6. Final Sign-Off Section

#### A. Rules Locked and Ready for Implementation
- Combat damage resolution: simultaneous damage assignment, Front Desk Guard priority enforcement, Infiltration bypass.
- Option A Temporary Stamina Buffer model: ablative damage absorption, augmented healing limit, end-of-shift clamping $\min(\text{Current}, M_{\text{base}})$.
- State-Based Action sweep: clocking out to Breakroom at $\le 0$ stamina.
- Phase-separated timing: Combat damage in Phase 4; buff expiration in Phase 5.
- All 10 edge cases verified via unit tests (`src/engine/tests/stamina_buffer.test.ts`).

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- Maximum concurrent temporary buffs per character (locked to 2 default; configurable to 3 if high-synergy buff archetypes emerge).
- Visual telegraphing fx timing and combat animation durations.

#### C. Features That Are Documented But Not Implemented
- Specialized damage mitigation keywords (e.g. "Divine Shield" / "Safety Goggles" single-hit damage negation).
- Poisonous / Instant-Clock-Out on damage keywords.

#### D. Remaining Questions Requiring Stakeholder Approval
- None. Combat laws and Option A temporary stamina mechanics are fully verified and locked.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
