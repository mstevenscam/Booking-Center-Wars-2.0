# BOOKING WARS: THE BATTLE FOR THE BOOKING CENTRE
## UI/UX DESIGN GUIDELINES & VISUAL SYSTEM
**Version:** 1.0.0-UIUX  
**Aesthetic Style:** Hearthstone Tactical CCG Polish meets Workplace Satire  
**Viewport Baseline:** 1440x900 Desktop-First (Responsive down to 1024x768 and mobile handoff)  

---

### 1. BATTLEFIELD LAYOUT ARCHITECTURE
The playfield is arranged as a weathered service counter at midnight in the Booking Centre, accented by warm desk lamps, amber status LEDs, and brushed aluminum rack rails.

```
┌────────────────────────────────────────────────────────────────────────┐
│  [Opponent Supervisor: Morale: 30] [Hand: 4 Cards (Hidden)] [Shift: 6] │
│  [Active Policy Slot]                                                  │
├────────────────────────────────────────────────────────────────────────┤
│                [OPPONENT FIELD: 5 CHARACTER SLOTS]                     │
│    [ Slot 0 ]    [ Slot 1 ]    [ Slot 2 ]    [ Slot 3 ]    [ Slot 4 ]  │
├────────────────────────────────────────────────────────────────────────┤
│                       SHARED BOOKING QUEUE                             │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  [END SHIFT]  │
│   │ Ticket #0412 │   │ Ticket #0413 │   │ Ticket #0414 │  [ TURN 4  ]  │
│   │ 2 Turns Left │   │ 1 Turn Left  │   │ Ready Now!   │               │
│   └──────────────┘   └──────────────┘   └──────────────┘               │
├────────────────────────────────────────────────────────────────────────┤
│                 [PLAYER FIELD: 5 CHARACTER SLOTS]                      │
│    [ Slot 0 ]    [ Slot 1 ]    [ Slot 2 ]    [ Slot 3 ]    [ Slot 4 ]  │
├────────────────────────────────────────────────────────────────────────┤
│  [Player Supervisor: Morale: 30] [Active Policy] [Shift: 4/4 Available]│
│  [PLAYER HAND: Interactive Card Arc with Hover Lift & Drag Targeting]   │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 2. COLOR PALETTE & TOKEN SPECIFICATIONS
The visual identity draws inspiration from Humber College institutional tones mixed with tactile equipment cages and dark-mode game surfaces:

| Token Name | Hex Code | Usage |
|:---|:---|:---|
| **Humber Navy Deep** | `#001e44` | Battlefield background depth & structural frames |
| **Humber Gold Amber**| `#e59a00` | Legendary card trims, active Shift indicators, priority accents |
| **Cage Steel**       | `#334155` | Neutral card borders, mechanical rack frames |
| **Stamina Red**      | `#ef4444` | Health, damage numbers, Clock Out warnings |
| **Power Attack Gold**| `#f59e0b` | Offensive values, attack targeting reticles |
| **Influence Violet** | `#8b5cf6` | Influence badges, queue manipulation effects |
| **Receipt Parchment**| `#fef3c7` | Booking Queue tickets, barcodes, incident notices |
| **Terminal Green**   | `#10b981` | Ready status glows, heal effects, confirmation buttons |

---

### 3. CARD FRAME ANATOMY & TYPOGRAPHY
Each card frame is visually proportioned at standard `2.5 : 3.5` aspect ratio:
- **Top Left Badge:** Hexagonal or circular Shift Cost badge in glowing cyan/amber.
- **Top Banner:** Bold embossed card name with rarity banner backing.
- **Center Art Window:** High-resolution portrait framed with lanyard badge clips or equipment cage mesh.
- **Middle Ribbon:** Affiliation tag pill (e.g. `[TECHNICIAN] · [PRODUCTION]`).
- **Text Box:** Weathered ivory card stock with sharp, readable sans-serif typography (13-14px) containing bold keyword prefixes and flavor quotes.
- **Bottom Left:** Jagged attack badge displaying **Power** (Sword/Wrench icon).
- **Bottom Center:** Diamond badge displaying **Influence** (Megaphone/Badge icon).
- **Bottom Right:** Heart or shield badge displaying **Stamina** (First Aid/Battery icon).

---

### 4. INTERACTION & ANIMATION BEHAVIORS
1. **Card Arc Physics:**
   - Cards in hand rest in a natural curved fan with slight tilt (-6° to +6°).
   - Hovering a card smoothly translates it upwards (+40px), scales it by 1.25x, and elevates its z-index with a soft drop shadow.
2. **Targeting Laser:**
   - Dragging an attacking character or targeted incident draws an interactive bezier targeting arrow from source to cursor, snapping to valid targets with a red/gold pulsing reticle.
3. **Screen Shake & Hitstop:**
   - Characters impacting for 4+ damage trigger a brief 50ms simulation hitstop and a subtle 3px decaying canvas shake.
4. **The Privacy Handoff Curtain:**
   - Full-screen modal with smooth opacity fade and an animated security badge:
     *"Pass device to Supervisor 2 — Confidential Shift Handover"*.
   - Prevents accidental peeking between turns in local multiplayer.
