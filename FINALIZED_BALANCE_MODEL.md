# FINALIZED BALANCE MODEL & MATHEMATICAL SPECIFICATION
## Booking Wars: The Battle for the Booking Centre — Rules Lock Specification

---

### Formula 1: Vanilla Stat Curve Equation

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 19-22)
export function calculateVanillaBudget(shiftCost: number): number {
  if (shiftCost < 1) return 1;
  return (shiftCost * 2) + 1;
}
```

#### 2. Mathematical Definition
```
Total Stats = (2 * ShiftCost) + 1
Efficiency + Stamina = (2 * C) + 1
```

#### 3. Variable Definitions
- `C` (`shiftCost`): Integer energy cost required to deploy the character immediately ($C \in [1, 10]$).
- `Total Stats`: The combined baseline combat budget allocated to a vanilla character with no positive or negative keywords, abilities, or Influence bonuses.

#### 4. Calculation Order
1. Multiply `shiftCost` by $2$.
2. Add $1$ to the product.
3. Distribute the resulting integer between Efficiency (attack) and Stamina (health), where $\text{Efficiency} \ge 1$ and $\text{Stamina} \ge 1$.

#### 5. Rounding Rules
- Integer arithmetic only. Base vanilla budgets are exact whole integers.

#### 6. Minimum and Maximum Bounds
- **Minimum Value:** When $C = 1 \implies \text{Total Stats} = (1 \times 2) + 1 = 3$ (e.g., 2/1 or 1/2).
- **Maximum Value:** When $C = 10 \implies \text{Total Stats} = (10 \times 2) + 1 = 21$ (e.g., 10/11 or 11/10).

#### 7. Worked Numerical Examples
- **Turn 1 (Cost 1):** $(1 \times 2) + 1 = 3$ stats $\implies$ 1 Efficiency / 2 Stamina or 2 Efficiency / 1 Stamina.
- **Turn 2 (Cost 2):** $(2 \times 2) + 1 = 5$ stats $\implies$ 2 Efficiency / 3 Stamina or 3 Efficiency / 2 Stamina.
- **Turn 3 (Cost 3):** $(3 \times 2) + 1 = 7$ stats $\implies$ 3 Efficiency / 4 Stamina or 4 Efficiency / 3 Stamina.
- **Turn 4 (Cost 4):** $(4 \times 2) + 1 = 9$ stats $\implies$ 4 Efficiency / 5 Stamina.
- **Turn 7 (Cost 7):** $(7 \times 2) + 1 = 15$ stats $\implies$ 7 Efficiency / 8 Stamina.

#### 8. Source Code Location & Status
- File: `/src/engine/balance.ts`, function `calculateVanillaBudget`
- Status: **Implemented & Verified** (`/src/engine/tests/balance.test.ts`).

---

### Formula 2: Influence Stat Tax Equation

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 30-33)
export function calculateInfluenceTax(influence: number): number {
  if (influence <= 1) return 0;
  return (influence - 1) * 1.5;
}
```

#### 2. Mathematical Definition
```
InfluenceTax = max(0, (Influence - 1) * 1.5)
```

#### 3. Variable Definitions
- `Influence` ($I$): The character's board authority and queue priority value ($I \in [1, 4]$). Base baseline is $I = 1$.
- `InfluenceTax`: The stat budget penalty deducted from the vanilla stat allowance to pay for higher influence. Each $+1$ Influence above 1 costs $1.5$ raw stat points (~$0.75$ Shift).

#### 4. Calculation Order
1. Calculate excess influence: $\text{excess} = I - 1$.
2. If $\text{excess} \le 0$, $\text{InfluenceTax} = 0$.
3. If $\text{excess} > 0$, multiply $\text{excess}$ by $1.5$.
4. Deduct $\text{InfluenceTax}$ from the character's Vanilla Stat budget:
   $$\text{Allowed Base Stats} = \text{calculateVanillaBudget}(C) - \text{InfluenceTax}$$

#### 5. Rounding Rules
- Intermediate tax can have $.5$ fractions. When allocating individual Efficiency and Stamina integers, character designers round to the nearest whole stat; total card budget must satisfy $|\Delta| \le 1.0$.

#### 6. Minimum and Maximum Bounds
- **Minimum Value:** When $I = 1 \implies \text{Tax} = 0$.
- **Maximum Value:** When $I = 4 \implies \text{Tax} = (4 - 1) \times 1.5 = 4.5$ stat points (~2.25 Shift).

#### 7. Worked Numerical Examples
- **Example A (Standard Worker):** 4-Cost, Influence 1.
  - Vanilla Budget $= (4 \times 2) + 1 = 9$ stats.
  - Influence Tax $= (1 - 1) \times 1.5 = 0$.
  - Result: 4 Efficiency / 5 Stamina (Total: 9 stats). Balanced ($\Delta = 0$).
- **Example B (Shift Lead):** 4-Cost, Influence 2.
  - Vanilla Budget $= 9$ stats.
  - Influence Tax $= (2 - 1) \times 1.5 = 1.5$ stats.
  - Allowed Stats $= 9 - 1.5 = 7.5$ stats $\implies$ 4 Efficiency / 4 Stamina (Total: 8 stats, $\Delta = +0.5$, within $\pm 1$ envelope).
- **Example C (Department Director):** 5-Cost, Influence 3.
  - Vanilla Budget $= (5 \times 2) + 1 = 11$ stats.
  - Influence Tax $= (3 - 1) \times 1.5 = 3.0$ stats.
  - Allowed Stats $= 11 - 3.0 = 8.0$ stats $\implies$ 4 Efficiency / 4 Stamina.

#### 8. Source Code Location & Status
- File: `/src/engine/balance.ts`, function `calculateInfluenceTax`
- Status: **Implemented & Verified** (`/src/engine/tests/simulation_validator.test.ts`).

---

### Formula 3: Booking Queue Discount Equation

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 41-45)
export function calculateEffectiveQueueCost(immediateCost: number, queueTurns: number): number {
  if (queueTurns <= 0) return immediateCost;
  const discount = queueTurns * 0.75;
  return Math.max(1, Math.round(immediateCost - discount));
}
```

#### 2. Mathematical Definition
```
Discount = QueueTurns * 0.75
EffectiveQueueCost = max(1, round(ImmediateCost - Discount))
```

#### 3. Variable Definitions
- `ImmediateCost` ($C_{\text{imm}}$): The normal Shift Cost to deploy the card to the front counter immediately (integer $\ge 1$).
- `QueueTurns` ($T_{\text{queue}}$): The number of complete turns the card must wait in the Booking Queue ($T_{\text{queue}} \in \{1, 2, 3, 4\}$).
- `EffectiveQueueCost` ($C_{\text{eff}}$): The upfront Shift Cost paid by the player on the turn the ticket is entered into the queue.

#### 4. Calculation Order
1. Multiply `queueTurns` by $0.75$.
2. Subtract discount from `immediateCost`.
3. Round to the nearest integer using standard half-up arithmetic (`Math.round`).
4. Apply the canonical minimum floor using `Math.max(1, ...)`.

#### 5. Rounding Rules
- Standard arithmetic round: if fractional component is $\ge 0.5$, round up; otherwise round down.

#### 6. Minimum and Maximum Bounds
- **Strict Minimum Floor:** Exactly **1 Shift**. A card can NEVER cost 0 Shift or refund resources through queuing.
- **Maximum Discount:** 4 turns $\times 0.75 = 3.0$ Shift discount.

#### 7. Worked Numerical Examples
- **Example 1:** 4-Cost card delayed 2 turns.
  - Discount $= 2 \times 0.75 = 1.50$.
  - Net $= 4 - 1.50 = 2.50 \implies \text{round}(2.50) = 3$ Shift.
- **Example 2:** 6-Cost card delayed 2 turns.
  - Discount $= 2 \times 0.75 = 1.50$.
  - Net $= 6 - 1.50 = 4.50 \implies \text{round}(4.50) = 5$ Shift.
- **Example 3:** 7-Cost card delayed 3 turns.
  - Discount $= 3 \times 0.75 = 2.25$.
  - Net $= 7 - 2.25 = 4.75 \implies \text{round}(4.75) = 5$ Shift.
- **Example 4 (Floor Enforcement):** 1-Cost card delayed 2 turns.
  - Discount $= 2 \times 0.75 = 1.50$.
  - Net $= 1 - 1.50 = -0.50 \implies \text{round}(-0.50) = 0$.
  - Clamped by floor: $\max(1, 0) = \mathbf{1\text{ Shift}}$.

#### 8. Source Code Location & Status
- File: `/src/engine/balance.ts`, function `calculateEffectiveQueueCost`
- Status: **Implemented & Verified** (`/src/engine/tests/simulation_validator.test.ts`).

---

### Formula 4: Shift Capacity & Cumulative Pool Progression

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 52-62)
export function getShiftCapacity(turn: number): number {
  return Math.max(1, Math.min(10, turn));
}

export function getCumulativeShiftPool(turn: number): number {
  let sum = 0;
  for (let t = 1; t <= turn; t++) {
    sum += getShiftCapacity(t);
  }
  return sum;
}
```

#### 2. Mathematical Definition
```
Capacity_t = min(10, max(1, t))
CumulativePool_T = sum_{t=1}^T min(10, t)
```

#### 3. Variable Definitions
- $t$: Current match turn number (integer $\ge 1$).
- $\text{Capacity}_t$: The maximum Shift Hours available to a player during turn $t$.
- $\text{CumulativePool}_T$: The total aggregate energy budget provided to a player over $T$ turns.

#### 4. Calculation Order
1. For turn $t$, take $t$ and clamp between 1 and 10.
2. For cumulative pool, sum $\text{Capacity}_t$ from $t = 1$ to $T$.

#### 5. Rounding Rules
- Integer exact.

#### 6. Minimum and Maximum Bounds
- Capacity min: 1 Shift (Turn 1). Capacity max: 10 Shift (Turn 10+).

#### 7. Worked Numerical Examples
- $t = 1 \implies \text{Capacity} = 1$, $\text{CumulativePool} = 1$.
- $t = 2 \implies \text{Capacity} = 2$, $\text{CumulativePool} = 1 + 2 = 3$.
- $t = 3 \implies \text{Capacity} = 3$, $\text{CumulativePool} = 3 + 3 = 6$.
- $t = 4 \implies \text{Capacity} = 4$, $\text{CumulativePool} = 6 + 4 = 10$.
- $t = 5 \implies \text{Capacity} = 5$, $\text{CumulativePool} = 10 + 5 = 15$.
- $t = 10 \implies \text{Capacity} = 10$, $\text{CumulativePool} = 55$.

#### 8. Source Code Location & Status
- File: `/src/engine/balance.ts`, functions `getShiftCapacity` and `getCumulativeShiftPool`
- Status: **Implemented & Verified** (`/src/engine/tests/balance.test.ts`).

---

### Formula 5: Keyword & Ability Stat Taxation Table

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 68-74)
export const KEYWORD_TAXES = {
  front_desk_guard: 1.0, // 0.5 Shift cost
  rush: 1.5,             // 0.75 Shift cost
  first_responder: 3.0,  // 1.5 Shift cost (immediate face/minion attack)
  infiltration: 1.0,     // 0.5 Shift cost (bypasses Front Desk Guard)
  draw_one_card: 2.0     // 1.0 Shift cost
};
```

#### 2. Taxation Schedule

| Keyword (Internal ID) | Visible Canonical Name | Stat Budget Tax | Shift Equivalent | Design Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `front_desk_guard` | **Front Desk Guard** | **+1.0 stat point** | ~0.50 Shift | Protects Supervisor Morale and friendly characters; forces inefficient opponent trades. |
| `rush` | **Rush** | **+1.5 stat points** | ~0.75 Shift | Allows immediate attack against enemy characters on deployment turn; high board-swing potential. |
| `first_responder` | **First Responder** | **+3.0 stat points** | ~1.50 Shift | Allows immediate attack against enemy characters OR Supervisor Morale (Charge mechanic). |
| `infiltration` | **Infiltration** | **+1.0 stat point** | ~0.50 Shift | Ignores enemy Front Desk Guards; enables direct targeting of high-value characters or face. |
| `draw_one_card` | **Draw 1 Card** | **+2.0 stat points** | ~1.00 Shift | Card advantage replacement (~1 Shift worth of value). |

---

### Formula 6: Net Card Balance Evaluation Equation

#### 1. Plain-Text Code Implementation
```typescript
// Source: /src/engine/balance.ts (Lines 88-144)
export function evaluateCardBalance(card: {
  shiftCost: number;
  efficiency?: number;
  stamina: number;
  influence: number;
  hasFrontDeskGuard?: boolean;
  hasRush?: boolean;
  hasCharge?: boolean;
  hasInfiltration?: boolean;
  cardsDrawn?: number;
}): CardBalanceEvaluation {
  const efficiency = card.efficiency ?? 0;
  const expectedStats = calculateVanillaBudget(card.shiftCost);
  
  const baseStats = efficiency + card.stamina;
  let allocatedValue = baseStats;
  
  const influenceTax = calculateInfluenceTax(card.influence);
  allocatedValue += influenceTax;
  
  let keywordTaxes = 0;
  if (card.hasFrontDeskGuard) keywordTaxes += KEYWORD_TAXES.front_desk_guard;
  if (card.hasRush) keywordTaxes += KEYWORD_TAXES.rush;
  if (card.hasCharge) keywordTaxes += KEYWORD_TAXES.first_responder;
  if (card.hasInfiltration) keywordTaxes += KEYWORD_TAXES.infiltration;
  if (card.cardsDrawn) keywordTaxes += card.cardsDrawn * KEYWORD_TAXES.draw_one_card;
  allocatedValue += keywordTaxes;

  const delta = allocatedValue - expectedStats;
  const isBalanced = Math.abs(delta) <= 1; // Allowed ±1 margin

  return { expectedStats, actualAllocatedValue: allocatedValue, delta, isBalanced, breakdown: { baseStats, influenceTax, keywordTaxes } };
}
```

#### 2. Mathematical Definition
```
ActualAllocatedValue = (Efficiency + Stamina) + InfluenceTax + sum(KeywordTaxes)
Delta = ActualAllocatedValue - calculateVanillaBudget(ShiftCost)
Balanced Card Criterion: |Delta| <= 1.0
```

#### 3. Worked Numerical Example
- **Card: Senior Cage Tech** (Cost 3, 2 Efficiency / 3 Stamina, Front Desk Guard, Influence 1).
  - Vanilla Budget $= (3 \times 2) + 1 = 7.0$ points.
  - Base Stats $= 2 + 3 = 5.0$.
  - Influence Tax $= 0.0$.
  - Guard Tax $= 1.0$.
  - Total Allocated Value $= 5.0 + 1.0 = 6.0$.
  - $\Delta = 6.0 - 7.0 = -1.0$ (Card is slightly conservative, within $\pm 1.0$ envelope).
  - `isBalanced: true`.

---

### 7. Final Sign-Off Section

#### A. Rules Locked and Ready for Implementation
- All 6 mathematical formulas: Vanilla Budget, Influence Tax, Queue Discount with 1-Shift floor, Shift Capacity scaling, Keyword Taxes, and Net Card Balance Evaluation ($\pm 1.0$).
- Deterministic simulation curves and archetype budgets (Aggro, Midrange, Control).

#### B. Rules Intentionally Left Configurable for Phase 2 Testing
- Ability taxation for complex multi-target damage and continuous aura effects.
- Fine-tuning of First Responder tax (3.0 vs 3.5 stat points based on human playtest data).

#### C. Features That Are Documented But Not Implemented
- Dynamic scaling of keyword taxes based on archetype synergy bonuses.
- Complex nonlinear mana-curve penalization for high-cost legendaries (8+ Shift).

#### D. Remaining Questions Requiring Stakeholder Approval
- None. All 6 core balance formulas are mathematically and logically locked in `src/engine/balance.ts`.

#### E. Phase 1B Approval Readiness
- **STATUS: APPROVED & LOCKED FOR PHASE 2 ENGINE ARCHITECTURE.**
