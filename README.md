# Pigeons vs Magpies

Pigeons vs Magpies is a small real-time strategy prototype where two bird factions compete to gather resources, expand territory, and outmaneuver each other through unit production and tactical positioning.

The project is focused on fast iteration, playful experimentation, and code readability so anyone can become a contributor and contributors can quickly jump in and try ideas.

Want to join in? Discord: [https://discord.gg/vibecoding](https://discord.gg/vibecoding)

## Core Idea

- Gather resources from nodes across the map.
- Build structures to grow your economy and control space.
- Spawn and direct units to pressure the opposing faction.
- Use simple AI and balance tuning to shape match flow.

## Tech Stack

- Phaser
- TypeScript
- Vite

## Getting Started

1. Install dependencies:

	```bash
	npm install
	```

2. Start the development server:

	```bash
	npm run dev
	```

3. Build for production:

	```bash
	npm run build
	```

4. Preview the production build:

	```bash
	npm run preview
	```

## Project Structure

- `src/scenes/` game flow, menus, and UI scenes
- `src/entities/` units, buildings, and resource nodes
- `src/systems/` game logic systems such as AI
- `src/config/` balancing values and game tuning
- `src/persistence/` save/load persistence utilities
- `resources/specs/` design and prompt documents

## Contributing

This is a collaborative effort between anyone who wants to try their hand at vibe coding. If you have an idea, prototype it, tune it, and open a contribution.

Useful contribution directions:

- Add or adjust unit and building behaviors
- Improve AI decision-making
- Refine UI feedback and readability
- Tune balance values for better match pacing
- Expand scenario and map variety

## License and Ownership

This project is entirely public domain.

All code, assets, and design material in this repository are dedicated to the public domain. Use it, remix it, fork it, and share it freely.
