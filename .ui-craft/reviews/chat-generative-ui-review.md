# Generative UI thread — engineering review

Date: 2026-06-30  
Scope: `AeGenerativeAnswer`, layout profiles, thread chrome, replay fidelity

## Frontend Developer

- [x] Sticky thread header + composer; collapsed turns reduce scroll fatigue
- [x] Horizontal card rail on compact profiles (`ae-answer__sources--scroll`)
- [x] Thinking rail uses `role="status"`; one-line uses single `aria-live` during stream
- [x] Follow-up chips are native `<button>` index tabs (not toggle group)

## Software Architect

- [x] Single renderer: `AeGenerativeAnswer`
- [x] `buildMessagePartsFromSnapshot` maps snapshot → parts + profile
- [x] `AnswerLayoutProfile` enum extensible without client heuristics on replay

## Multi-Agent Systems Architect

- [x] Intent → profile via `computeLayoutProfile` in synthesizer freeze path
- [x] `FrozenTurnProse` persists `layoutProfile` + `compactLayout`
- [x] Replay rebuilds artifacts from frozen prose (no silent truncation)
- [x] Chip `submitQuery` separate from display `label`

## Prompt Engineer

- [x] OpenUI library extended: ThinkingRail, EmptyState, CompareStrip, ThreadFooter
- [x] Preamble rules: profiles + thread footer once per thread

## AI Engineer

- [x] Deterministic path fully profile-driven before gated LLM layout selection
- [x] Prose-only LLM path unchanged; artifacts from allowlist builder

## Minimal Change Engineer

- [x] Scope limited to chat shell, projection, artifact builder, OpenUI library
- [x] Legacy standalone stream sections removed; live path is `AeThreadTurnStreamSection`

## Technical Writer

- [x] `.ui-craft/surfaces/chat.md` updated for thread-first + profiles
- [ ] `.planning/ANSWER-AI-CONTRACT.md` diagram — follow-up PR (renderer rename note only)

## assistant-ui spike (P3)

- **Decision:** Native `AeGenerativeAnswer` ships in production. assistant-ui Thread/Message adapter deferred to branch spike — see `.ui-craft/decisions.md` 2026-06-30 generative UI entry.
- **Rationale:** Thread transcript, frozen replay, and layout profiles are already wired; assistant-ui adds dependency weight without clearing a blocker.

## Sign-off

Ready to merge after unit + integration tests pass.
