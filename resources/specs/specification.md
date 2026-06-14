# Pigeons vs Magpies — Prototype Specification

Companion to [Pigeons_vs_Magpies_Prompt.md](Pigeons_vs_Magpies_Prompt.md). The prompt describes the vision; this document pins down the concrete decisions needed to build it. All numbers are **tunable defaults** — chosen to feel roughly like *Warcraft: Orcs & Humans* (1994), not playtested truths. Inspired by the mechanics and feel of classic RTS games - it is not a decompilation, copy, or clone of those games. The game is titled **"Pigeons vs Magpies"**. They live in one config file (see §8) so balancing is a data change, not a code change.

## 1. Game Overview

- **Genre:** 2D top-down real-time strategy, single-player skirmish.
- **Setting:** An urban park turf war.
- **Player faction:** Pigeons. **AI opponent:** Magpies (prototype: same units/buildings
  as Pigeons with a different tint — asymmetric design is post-prototype).
- **Win condition:** Destroy all enemy buildings.
- **Lose condition:** All of your buildings are destroyed.
- **Session length target:** 10–15 minutes.

## 2. World & Map

- **World size:** 2000 × 2000 px, bounded (no scrolling past edges).
- **Coordinate space:** Continuous positions; a 50 px logical grid is used for building
  placement and (later) pathfinding.
- **Skirmish map layout (symmetric):**
  - Player Main Nest at (300, 1700); Magpie Main Nest at (1700, 300).
  - Each start location has 1 Picnic Blanket (~250 px away) and 2 Bushes (~200–350 px away).
  - 1 contested Picnic Blanket at map centre (richer: 2× capacity).
  - Scattered decorative obstacles (park benches, ponds) are **out of scope** for the
    prototype; the map is open ground.
- **Camera:** Pans with WASD/arrow keys (500 px/s) and when the cursor is within 20 px of
  a screen edge. Clamped to world bounds.

## 3. Economy

### Resources

| Resource | Analogue | Source node | Node capacity | Carry per trip | Gather time |
|---|---|---|---|---|---|
| Breadcrumbs | Gold | Picnic Blanket | 5,000 (centre: 10,000) | 10 | 2.0 s |
| Twigs | Lumber | Bush | 1,500 | 8 | 2.5 s |

- **Gather loop:** Forager walks to node → waits *gather time* at node → walks to nearest
  Main Nest → deposits instantly → repeats automatically until ordered otherwise.
- One node supports any number of simultaneous gatherers in the prototype (no queuing).
- A node with 0 remaining resources is removed from the map.
- **Starting stockpile:** 200 breadcrumbs, 100 twigs.

### Population

- Each unit costs 1 population.
- Main Nest provides 5 population; each Birdbath provides 4.
- **Population cap ceiling:** 30. Training is blocked (with UI feedback) when at cap.

## 4. Units

All units: collision radius 12 px, selectable, drawn as coloured circles
(player: grey/blue tint; enemy: black/white tint) with a thin health bar above when
damaged or selected.

| Unit | Role | HP | Damage | Attack range | Attack cooldown | Speed (px/s) | Cost (crumbs/twigs) | Train time |
|---|---|---|---|---|---|---|---|---|
| Forager | Worker | 30 | 2 | melee (20 px) | 1.0 s | 80 | 75 / 0 | 8 s |
| Pecker | Melee | 60 | 8 | melee (20 px) | 1.0 s | 90 | 100 / 0 | 10 s |
| Poop-Bomber | Ranged | 40 | 6 | 180 px | 1.5 s | 85 | 100 / 25 | 12 s |

- **Forager** additionally gathers resources and constructs buildings.
- **Poop-Bomber** projectiles are instant-hit for the prototype (draw a brief line/splat
  effect); real projectiles are post-prototype.
- No friendly fire. Dead units fade out over 1 s, then are destroyed.

### Unit states

State machine per unit: `IDLE → MOVING → GATHERING / BUILDING / ATTACKING → DEAD`.

- **IDLE:** Combat units auto-acquire enemies entering aggro radius (200 px). Foragers do not.
- **MOVING:** Move orders are "attack-move" for combat units only if issued via
  right-click on an enemy; plain right-click moves never auto-engage en route (keep it
  simple for the prototype).
- **GATHERING:** The full gather loop above (sub-states: travelling-to-node, gathering,
  returning). Survives interruptions — if the node empties, the Forager goes idle.
- **ATTACKING:** Chase target while in aggro range; return to original post if the target
  dies or escapes beyond 1.5× aggro radius.
- **DEAD:** Terminal.

## 5. Buildings

Drawn as coloured rectangles with a health bar. Buildings are placed on the 50 px grid,
may not overlap other buildings/nodes, and require a Forager to construct (the Forager is
occupied for the build time; the building's HP scales up from 10% to 100% as it builds).

| Building | Size (px) | HP | Cost (crumbs/twigs) | Build time | Function |
|---|---|---|---|---|---|
| Main Nest | 100×100 | 600 | 400 / 200 | 60 s | Drop-off point; trains Foragers; +5 pop |
| Birdbath | 50×50 | 150 | 0 / 75 | 15 s | +4 pop |
| Branch Barracks | 100×100 | 400 | 150 / 100 | 30 s | Trains Peckers and Poop-Bombers |

- Each production building has a **single-slot queue** in the prototype (one unit in
  training at a time; further clicks are ignored with UI feedback).
- New units spawn at the building's nearest free edge and step clear.
- Buildings do not attack. Destroyed buildings leave nothing behind.

## 6. Controls & UI

### Input

| Input | Action |
|---|---|
| Left-click unit/building | Select it (clears previous selection) |
| Left-click + drag | Box-select all own units in the box (buildings excluded from box-select) |
| Shift + left-click | Add/remove from current selection |
| Right-click ground | Move selected units (cluster around point with simple offsets) |
| Right-click enemy | Attack target |
| Right-click resource node (Foragers selected) | Gather |
| Esc | Cancel selection / cancel building placement |

- Selected entities show a selection ring/outline.
- Building placement: select a Forager → click a build button in the command panel → a
  ghost rectangle follows the cursor (green = valid, red = invalid) → left-click to place.

### HUD (separate Phaser UI scene, fixed to camera)

- **Top bar:** Breadcrumbs, Twigs, Population (current/cap).
- **Bottom panel:** Portrait/name of selection; command buttons (train buttons for
  selected production building; build buttons for selected Forager). Greyed out when
  unaffordable, with cost shown on hover.
- **Minimap:** out of scope for the prototype.

## 7. Enemy AI (Magpies)

A simple scripted opponent — enough to create pressure, not to be clever:

1. **Economy:** Maintains 4 Foragers gathering; rebuilds them if killed (while a Main
   Nest stands and resources allow).
2. **Build order:** Birdbath → Branch Barracks → train combat units continuously
   (alternate Pecker/Poop-Bomber) up to a squad of 6.
3. **Attack waves:** When the squad reaches 6, attack-move the squad at the player's Main
   Nest. Repeat. First wave is additionally gated to no earlier than the 3-minute mark.
4. **Defence:** Enemy units within 300 px of a Magpie building auto-engage attackers.

The AI cheats lightly if needed (e.g., flat resource trickle) rather than gaining
complexity — note any such cheat in a code comment.

## 8. Architecture

As required by the prompt: Phaser 3 + TypeScript + Vite, primitive shapes only, sprite
swap-in friendly (all drawing isolated behind each entity's `draw`/appearance layer).

```
src/
  main.ts                 # Phaser.Game config
  config/balance.ts       # ALL tunable numbers from this spec, as typed constants
  scenes/
    PreloaderScene.ts
    MainGameScene.ts      # world, entities, input, AI tick
    UIScene.ts            # HUD overlay, runs in parallel with MainGameScene
  entities/
    Entity.ts             # base: position, hp, faction, selection
    Unit.ts               # movement, state machine
    Building.ts           # construction, training queue
    units/{Forager,Pecker,PoopBomber}.ts
    buildings/{MainNest,Birdbath,BranchBarracks}.ts
  systems/
    InputSystem.ts        # selection box, contextual right-click, placement ghost
    MovementSystem.ts     # straight-line steering; A*/flow-field integration point
    CombatSystem.ts       # target acquisition, damage, death
    EconomySystem.ts      # stockpiles, gather loop bookkeeping
    AISystem.ts           # Magpie controller (§7)
  types.ts                # shared enums (UnitState, Faction, ResourceType) & interfaces
```

- **Pathfinding:** straight-line movement with collision-radius separation pushes only.
  `MovementSystem` exposes `requestPath(unit, target)` as the single seam where A* or a
  navmesh plugs in later (commented as such, per the prompt).
- **Determinism/scale:** single-player, no networking; plain per-frame update loop over
  entity arrays is fine. No ECS framework.
- **Conventions:** British English throughout; every code file opens with the comment
  `// Oi mate! This is a coo!` (per the source prompt).

## 9. Out of Scope (Prototype)

Explicitly deferred so they don't creep in: sprite art & animation, sound, asymmetric
Magpie faction design, fog of war, minimap, A*/navmesh pathfinding, projectile physics,
obstacles/terrain, save/load, multiplayer, multi-slot production queues, attack-move as a
distinct command, upgrades/tech tree.

## 10. Milestones

1. **M1 — Walking skeleton:** Vite project boots; camera pans over an empty bounded world;
   HUD shows static resource counts.
2. **M2 — Selection & movement:** Units exist; click/box-select; right-click move with
   clustering.
3. **M3 — Economy:** Nodes, gather loop, deposits update the HUD; train Foragers at the
   Main Nest; population cap enforced.
4. **M4 — Construction & production:** Forager builds Birdbath/Barracks; Barracks trains
   combat units.
5. **M5 — Combat:** Attack orders, auto-acquire, health bars, death; buildings damageable.
6. **M6 — Skirmish:** Magpie AI per §7; win/lose detection and end screen. **Playable
   prototype complete.**