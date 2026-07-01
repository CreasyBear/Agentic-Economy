# Spike Conventions

Patterns and stack choices established across spike sessions. New spikes follow these unless the question requires otherwise.

## Stack

- Use small dependency-free HTML/JS demos for product-feel spikes.
- Use Node-compatible scripts for deterministic verification.

## Structure

- Each spike gets `.planning/spikes/NNN-name/`.
- Include `README.md`, runnable demo or script files, and a `results.json` when useful.

## Patterns

- Prefer experiential demos when the question is about user intuition.
- Keep spike code isolated from `src/` until implementation is approved.

## Tools & Libraries

- No new libraries for v1 retrieval planning.
