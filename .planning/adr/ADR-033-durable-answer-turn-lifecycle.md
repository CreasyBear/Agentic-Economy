---
# ADR-033: Durable answer-turn lifecycle
Status: Accepted; implemented at source/local verification boundary
Date: 2026-08-08
Supersedes: The Chatpack comparison/port plan as the active decision record
---

## Decision

Agentic Economy adopts a durable answer-turn lifecycle in which Convex owns
admission, identity, ordering, lifecycle transitions, finalization and replay
truth. A turn is reserved before model or tool cost; the server allocates the
thread, turn and monotonic per-thread sequence; answer and ordered tool rows are
bound to that reservation; and a turn is publicly `complete` only after answer
persistence and harness finalization succeed. Transient SSE progress is a
notification of work, not terminal truth.

The adopted lifecycle also includes idempotent replay/convergence keyed by the
pseudonymous session, requested thread scope and client turn key, guarded by a
canonical request digest; small typed browser transport/state seams; durable
owner-authorized Stop; separate owner and explicit read-only share authority;
and a sanitized durable projection as the terminal client truth. These
mechanics do not relax AE's deterministic capability selection, model/tool
closure, source-write admission, harness evidence, redaction or authority
rules.

## Context and reference provenance

The comparison used Chatpack commit `39c47ebde2df9d9c0930f8e3e09d7ef9f20734ce`
as a reference for lifecycle mechanics. Chatpack is not an Agentic Economy
dependency, authority, registry, persistence adapter or product model. AE keeps
Convex and its existing domain contracts authoritative and ports only the
mechanics that improve durable answer turns.

The current source's evidence ceiling is local/source behavior. The maintained
maps `.planning/codebase/PROMPT-DATA-FLOW.md` and
`.planning/codebase/IA-DATA-FLOW.md` distinguish source and fixture evidence
from hosted, provider, payment and customer evidence. This ADR therefore makes
no deployment, provider, payment or customer-success claim.

## Adopted mechanics

- **Storage-owned ordering:** reservations allocate server-owned `threadId`,
  `turnId` and `seq`, using the union of persisted turns and reservations for
  ordering and the turn limit.
- **Durable-before-notify:** the route reserves before opening the model/tool
  stream; persisted terminal rows and harness journal/finalization precede a
  terminal success signal.
- **At-least-once, idempotent convergence:** exact reservation and finalization
  identities replay; material conflicts fail closed; retries/readbacks converge
  on the same durable row rather than starting a second execution.
- **Small typed client seams:** frame validation, sequence-aware state, typed
  Stop/readback outcomes and durable projection merging are explicit seams
  rather than string outcomes or duplicated lifecycle state machines.
- **Server-authorized Stop:** Stop is a durable state transition. Local stream
  abort is only cleanup after the server acknowledges Stop, and an already
  settled result is read back rather than overwritten.
- **Durable projection truth:** thinking/work frames remain transient. Pending,
  stopped, complete and error are projected from durable lifecycle/evidence;
  malformed terminal evidence fails closed instead of becoming a blank answer.

## AE-specific adaptations

AE implements these mechanics through Convex mutations and the existing
authority/evidence model, not through a generic chat infrastructure layer.
`convex/answerThreads.ts` reserves against indexed persisted/reserved rows and
owns the state transitions. `src/modules/answer-thread/answer-thread.functions.ts`
exposes the typed source-write ports, while
`src/routes/api.answer.turn.ts` validates the bounded request, requires
`X-AE-Turn-Key`, computes the canonical digest and reserves before invoking
`src/modules/answer-thread/internal/turn-orchestrator.ts`.

The lifecycle has a guarded resume deepening rather than blind crash replay.
`answerTurnReservations` stores a private run generation, lease owner and
canonical checkpoint in
`src/modules/answer-thread/internal/convex-schema.ts`. The acquire, renew and
checkpoint mutations in `convex/answerThreads.ts` require matching reservation
identity, request digest, generation and lease ownership. Resume mode requires
a valid durable checkpoint; it is not inferred from a failed readback or a
missing process. `convex/harnessSessions.ts` rechecks those identities and the
parent owner, finalizes evidence/journal state atomically with the terminal
reservation transition, and rejects stopped or stale lease winners. A pending
reservation can remain visible when no valid guarded resumption is available;
readback itself never restarts execution.

AE's evidence boundary remains load-bearing: capability/model/tool authority,
source-write admission, answer/tool digests, harness journal identity and
redacted public projection are retained. No generic storage adapter, Redis
transport or external lifecycle authority is introduced.

## Explicitly rejected Chatpack mechanics

- Any `@chatpack/*` package, copied Chatpack dependency, generic storage adapter
  or plugin/transport abstraction.
- Redis/realtime/pub-sub abstraction as a second source of ordering or terminal
  truth.
- Unread, reaction, member, social-graph or other Chatpack conversation models
  that do not belong to AE's answer-thread authority model.
- Persisted thinking-frame journals. Thinking and work progress remain
  transient SSE mechanics; only sanitized durable projection data is replayed.
- Process-local idempotency or claim maps. Durable reservation identity and
  digest conflict handling are authoritative.
- Fire-and-forget completion evidence, SSE completion treated as proof, or any
  path that can expose `complete` before persistence and harness finalization.
- Any weakening of AE's capability closure, model/tool authority, source-write
  admission, evidence ceiling, redaction or owner/share authorization.

## Implemented source seams

- **Reservation and finalization:**
  `src/modules/answer-thread/internal/convex-schema.ts`,
  `src/modules/answer-thread/answer-thread.functions.ts`,
  `src/modules/answer-thread/internal/turn-digests.ts`,
  `src/routes/api.answer.turn.ts`,
  `src/modules/answer-thread/internal/answer-turn-finalization.ts`,
  `convex/answerThreads.ts` and `convex/harnessSessions.ts`.
- **Transient stream and one lifecycle owner:**
  `src/components/ae/chat/turn-stream-session.ts`,
  `src/components/ae/chat/answer-stream.ts`,
  `src/components/ae/chat/use-answer-turn-lifecycle.ts` and
  `src/components/ae/chat/answer-turn-state.ts`.
- **Server-wins readback and Stop:**
  `src/components/ae/chat/thread-readback.ts`,
  `src/components/ae/chat/projection-merge.ts`,
  `src/components/ae/chat/turn-stop.ts`,
  `src/routes/api.answer.turn.stop.ts` and the durable Stop mutation in
  `convex/answerThreads.ts`.
- **Owner/share authority and projection:**
  `src/modules/answer-thread/internal/public-projection.ts`,
  `src/modules/answer-thread/answer-thread.functions.ts`,
  `convex/answerThreads.ts`,
  `src/routes/api.answer.threads.$threadId.ts` and
  `src/routes/s.$shareToken.tsx`. Owner reads use the pseudonymous session;
  shared reads use a server-verified opaque HMAC grant and expose only the
  sanitized read-only projection.
- **Maintained data-flow records:**
  `.planning/codebase/PROMPT-DATA-FLOW.md` and
  `.planning/codebase/IA-DATA-FLOW.md` record the reserve → execute → finalize →
  readback flow and its evidence/authority ceilings.

## Lessons learned

One React lifecycle hook must own stream attachment, reducer updates, Stop
ordering, settlement and durable readback convergence. Splitting those duties
between a hook and a second lifecycle reducer allows remount, stale-generation
and Stop races to diverge. `use-answer-turn-lifecycle.ts` now performs the
single convergence path, while `answer-turn-state.ts` owns the typed phases,
frame sequence, Stop state and durable turn application.

A terminal stream result enters settling; it does not establish completion.
The hook performs one bounded readback retry only for a network or typed
retryable readback failure. The retry is a GET/readback retry and never
restarts the POST, model run or tool execution; concealed 404s, malformed
responses and non-retryable failures are not retried as successful emptiness.
The server projection wins over optimistic state, and transient thinking is
never merged into durable replay.

The durable reservation must also carry enough identity to make recovery safe:
resume requires a valid checkpoint plus matching generation and lease owner,
while finalization revalidates the same identity. This is stronger than either
process-local claims or an unconditional no-reexecution rule.

## Consequences and accepted risks

The lifecycle makes ordering, replay, Stop and terminal evidence inspectable in
one durable source and prevents duplicate execution for an exact retained
session/key/digest identity. Reloads and remounts converge on the owner
projection, while a share link remains read-only and cannot submit, Stop,
revoke, delete or list.

The cost is additional reservation/checkpoint/lease state and stricter typed
failure handling. Thinking/work progress is intentionally lost on reload. A
process interruption without a valid durable checkpoint may leave a visible
pending reservation that requires an explicit owner Stop; a valid checkpoint
may be resumed only through the guarded generation/lease path. The owner
identity remains a pseudonymous browser cookie, so cookie loss loses private
owner access. Share URLs are bearer capabilities until revoke or thread
deletion, despite no-referrer/noindex/no-store handling. Separately governed
harness or inquiry records may outlive answer-thread deletion.

## Evidence boundary and closure

This is an accepted architecture decision at the source/local verification
boundary. It records current source seams and their invariants; it does not
claim a production deployment, live provider success, payment settlement or
customer validation. The Chatpack commit is historical comparison provenance
only.

This ADR is the durable authority for the Chatpack lifecycle comparison. The
research/port plan is superseded as an active decision record; it remains only
historical context. Future lifecycle changes must update this ADR and the two
maintained flow maps, and must preserve the adopt/adapt/reject boundary above.
