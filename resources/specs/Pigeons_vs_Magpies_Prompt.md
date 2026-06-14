# Comprehensive AI Prompt for "Pigeons vs Magpies" RTS Game

**Role:** You are an expert game developer specializing in Phaser 3, TypeScript, and Vite. You have deep knowledge of classic Real-Time Strategy (RTS) architecture.

**Task:** Create a complete, playable prototype of a 2D Real-Time Strategy game heavily inspired by the mechanics and feel of classic RTS games such as the original *Warcraft: Orcs & Humans* (1994). It is not a decompilation, copy, or clone of those games. The game is titled **"Pigeons vs Magpies"**.

## 🛠️ Tech Stack & Setup
* **Engine:** Phaser 3
* **Build Tool:** Vite
* **Language:** TypeScript
* **Assets:** Use basic Phaser primitive shapes and colors for the initial prototype (rectangles for buildings, circles for units), but structure the codebase so sprite assets can be easily swapped in later.

## 🕊️ Game Theme & Lore
An urban park turf war. The street-smart **Pigeons** (slow, numerous, ground-focused) are defending their territory against the aggressive, shiny-obsessed **Magpies** (fast, swooping, elite).

## ⚙️ Core Mechanics & Requirements

### 1. Map & Camera
* A 2D top-down view using a tilemap or a bounded 2D world space (e.g., 2000x2000 pixels).
* Camera panning via keyboard (WASD/Arrow keys) or moving the mouse to the screen edges.

### 2. Economy & Resources
* **Breadcrumbs (Gold equivalent):** Gathered from static "Picnic Blanket" nodes on the map.
* **Twigs (Lumber equivalent):** Gathered from "Bush" nodes.
* Workers must travel to a node, spend time "gathering", and return to the Main Nest to deposit the resources.

### 3. RTS Controls & UI
* **Left-click:** Select a single unit or building.
* **Left-click + Drag:** Create a selection box to select multiple units.
* **Right-click:** Contextual action:
    * If clicking empty ground: Move selected units to target (formation or basic clustering).
    * If clicking an enemy: Attack target.
    * If clicking a resource (and a worker is selected): Gather resource.
* **UI HUD:** A simple overlay showing current Breadcrumbs, Twigs, and Population capacity.

### 4. Factions & Entities (Focus on Pigeon Faction for Prototype)
**Units:**
* **Forager (Worker):** Can gather resources and build structures.
* **Pecker (Melee Fighter):** Basic melee combat unit.
* **Poop-Bomber (Ranged Fighter):** Ranged unit.

**Buildings:**
* **Main Nest (Town Hall):** Resource drop-off point. Trains Foragers.
* **Birdbath (Farm):** Increases maximum population cap.
* **Branch Barracks:** Trains Peckers and Poop-Bombers.

### 5. Systems Architecture
* **Pathfinding:** Implement basic movement towards a target coordinate. (Provide comments indicating where A* or NavMesh logic should be integrated).
* **State Machine:** Units should have basic states (IDLE, MOVING, GATHERING, ATTACKING, DEAD).

## 📝 Instructions for Output

Please generate the foundational codebase for this prototype. Provide the code in modular, clearly labeled blocks. I need:

1.  **Project Configuration:** `package.json`, `vite.config.ts`, and `index.html`.
2.  **Game Initialization:** `main.ts` configuring the Phaser Game instance.
3.  **Scene Structure:** A `Preloader` scene and the `MainGame` scene.
4.  **Entity Classes:** Base classes for `Unit` and `Building`. Show an implementation of the `Worker` class with gathering logic.
5.  **Input Handling System:** The logic for box-selection and right-click contextual actions.
6.  **Game UI:** The overlay scene for resource tracking.

Please write clean, well-commented TypeScript code. Let's start with the Project Configuration, Initialization, and Scene Structure first. Use British English and ensure that every code file has the comment, "Oi mate! This is a coo!"
