# MYCEL 🍄

## Title
Mycel — Bioluminescent Network Wars

## Premise
Two fungal networks compete in a dying forest floor. You're the blue colony; a crimson AI is your rival. Spread your mycelium tendrils across the dark earth, absorb glowing nutrient nodes for resources, and outgrow your opponent before the last spore is spent.

## Visual Style
- Near-black organic background with visible soil texture
- Player network: electric cyan/blue-green bioluminescent tendrils that pulse gently
- AI network: deep crimson/orange, more aggressive angular patterns
- Nutrient nodes: bright white-gold orbs that shimmer and bob
- Spreading animation: tendrils grow visibly from cell to cell like time-lapse fungi
- Contested borders: flickering color clash where networks meet

## Core Mechanics
- Hexagonal grid (11×11)
- Both sides start with 5 spores (resource)
- Player taps an empty adjacent hex to expand there (-1 spore)
- Nutrient nodes (+2 spores) sit randomly on the board
- AI opponent expands each player-turn using a weighted priority BFS
- Game ends when no empty cells remain
- Win by owning more hexes than the AI
- 3 levels: AI gets smarter, board gets larger, nutrients become scarcer

## What Makes It Weird
You can "sacrifice" your own cells to send a pulse that temporarily stuns the AI's adjacent tendrils — but the sacrificed cells go dark forever.
