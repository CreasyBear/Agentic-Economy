# Phase 3C post-closeout repair plan

## Decision supported

Determine whether the hosted paid-operation trial can honestly earn an
authenticated exact-revision hosted mock-sandbox claim after closing the nine
source and evidence gaps found by independent review.

## Starting custody

- Integration branch: `codex/phase3c-g4`
- Repair base: `021b037ef6447aa24ccdb139026e0bb711ba99a8`
- Repair base tree: `0eafe62e3c942480366ba78883400754aa666024`
- Phase 3B base: `2debf4b9f65ce228491f7d3d17ed1654a23bb496`
- Parent manifest: `/tmp/ae-phase3c-parent-custody-closeout.json`
- Canonical manifest digest:
  `31e5c167ddd53f83c8be7d0906d110242cf71c0940f1166239ba150a0f84757f`
- Protected inherited entries: exactly 66

The parent is sole integrator and evidence claimant. Each source cut runs in an
isolated worktree from the exact accepted parent revision, commits only its
allowlist, and returns a content-bound handoff. No cut edits `AGENTS.md`,
`PRODUCT.md`, `DESIGN.md`, Customer Request, non-paid actions, the inherited
66 paths, or external systems.

## Dependency-ordered cuts

1. **Immutable proposal and generation 6.** Persist the complete hosted payment
   proposal and its canonical digest atomically. Cold reconstruction and
   trusted reconciliation use only persisted material. New mock effects bind
   the same digest. Legacy terminal rows remain inspectable; legacy nonterminal
   rows without the proposal fail closed. Advance policy and receipt references
   to g6 while retaining g5 provenance.
2. **Human/agent continuity.** Add closed server-issued agent command
   descriptors, make the hosted journey follow them, repair authenticated stale
   human inspection, map unclassified post-command transport results to
   inspect-only `update_not_confirmed`, and reduce hidden human proof to semantic
   digest plus invocation version.
3. **Proof packet v2.** Preserve v1 for historical local integrity only. Bind
   all lifecycle calls to one immutable exact-SHA deployment URL, require
   proposal/effect cross-links and credential revocation, and retain an
   independently read disabled g6 admission state before the sole final-class
   emitter can return.
4. **Local integration and independent audit.** Run focused source, UI, browser,
   import, lint, changed-path type and diff gates. Three read-only reviewers
   independently inspect lifecycle, surfaces and evidence. Any P0/P1 receives
   one targeted correction from its original cut owner.
5. **Fresh hosted run.** Only after a separately named exact-revision external
   authorization: one non-force release, one Vercel Git deployment, one Convex
   deployment/configuration, one temporary human session, one one-hour scoped
   agent key, three fresh mock operations, immediate revocation, admission
   shutdown, raw readback and v2 packet admission.

## Claim ceiling and end conditions

Local work can establish source, fixture, labelled local browser and
`local_packet_integrity_only` evidence. Only the fresh live v2 collector can
emit `authenticated_exact_revision_hosted_sandbox`. Human comprehension remains
`NOT_RUN`. Nothing in this repair proves real provider fulfilment, payment,
settlement, production safety, demand, customer value or general non-paid
compatibility.

The loop ends with working source and source-bound evidence, a source-linked
narrowing decision, or the earliest genuine external blocker. Mechanical
fixture, import, typing and metadata problems are repaired inside the owned cut.

## Local integration checkpoint — 2026-07-21

Cuts 0-4 are locally complete. The source implementation snapshot immediately
before this planning checkpoint is
`74107bd347630e83c4fe4b4572e1d17335a932d0` (tree
`b00507a11690b8447fbd2f47c4692d8beaa4a51d`). The lifecycle, surface and release
goblins found no P0s; their P1s were returned once to the owning seams and closed
with focused regression contracts. The final local gates passed 188 Phase 3C
source checks, five UI-contract checks, twelve combined paid-operation browser
checks, 81 hosted-source checks, changed-path lint and diff checks. The retained
v1 packet still verifies only as `local_packet_integrity_only`.

The broad import command retains two unrelated baseline failures in capability
contract and private-import boundaries. Repository typecheck retains 108
unrelated diagnostics; none name a repair-changed TypeScript path. Neither
baseline is adopted by this repair loop. No push, deployment, Convex control
plane, Clerk credential or hosted lifecycle action occurred. Cut 5 is paused at
the required fresh exact-revision external-authorization checkpoint.
