# Scope 03 — Agent identity, mandates, and per-action clearance (CURRENT INDEX)

**Status:** active lightweight execution index.  
**Historical context:** `.planning/archive/scopes/scope-03-handshake-identity-clearance/`.  
**ADR:** `.planning/adr/ADR-003-handshake-agent-identity-clearance.md`.  
**Boundary:** identity is attribution, quota, and audit context; identity is never authority by itself.

## Current truth

- The project direction is Handshake-shaped internally, but Handshake/HSK/kernel/greenlight/clearance/mandate/protocol vocabulary does not ship publicly or in assistant-visible descriptors until PM-05 adaptation and a phase gate allow it.
- Web Bot Auth / signed request posture and the Handshake kernel adapter-pack direction are stackable. WBA is identity; per-action clearance/evidence is the action boundary.
- Archived 03-01 through 03-03 provide source-local context. `03-04-EVIDENCE-BINDING-MAP.md` is the next source-local implementation map.
- Any `/api/agent/tools` write beyond `inquiry.submit` remains blocked until signed principal + mandate validation + source-write admission + deliberate snapshot diff exist.
- Deployed signer/agent-facing proof waits on Scope 1 issue #5 and issue #36.

## Execution order

| Work | Source | Current status | Gate |
|---|---|---|---|
| 03-01 kernel acquisition/runtime spike | Archived summary | Source-local context complete | Do not expose HSK publicly. |
| 03-02 agent-door identity public posture | Archived plan/summary | Source-local context; public posture incomplete | PM-05 scan/descriptor adaptation; WBA proof. |
| 03-03 clearance module/store | Archived summary | Source-local context complete | Preserve fallback architecture if kernel-in-mutation not proved. |
| 03-04 evidence binding | Archived `03-04-EVIDENCE-BINDING-MAP.md` + plan | Source-local executable | No deployed signer proof; no new agentTools verbs. |

## Write-safety acceptance

Before any new write is exposed, tests/proof must show signed writes bind method, path, authority, timestamp, body digest, key id, and tool/action id. Replay must be durable: same signature cannot authorize another body/path/action and cannot create a second consequence beyond idempotent duplicate semantics.

## Scope-5 dependency output

Scope 5 may consume only a verified principal + active clearance mandate whose action ref, scope, business id, slug, amount/currency cap, expiry, and revocation state are read before creating a `CapabilityRequest`. Anonymous or mismatched writes refuse with typed reasons.
