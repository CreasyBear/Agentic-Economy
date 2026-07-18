---
# ADR-018: RouteMandate issue / revoke / history ports
Status: Accepted
Date: 2026-07-18
Scope: Wave 48 design unlock + Wave 49 implement deepen for correctness-critical RouteMandate mutation and history surfaces on `convex/customerRequestRouteMandate.ts`
Supersedes: nothing
Related: `.planning/adr/ADR-014-customer-request-v2-write-ports.md` (V2 write; mandate supersession only via lifecycle); `.planning/adr/ADR-017-customer-request-v2-read-ports.md` (V2 reads closed; **untouched**); `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` (same deepen pattern; different host); `.planning/codebase/CONCERNS.md`; `.planning/codebase/WAVES-43-49-PLAN.md` (Waves 48–49 mandate issue/revoke); gold deepen pattern (`v2-write` / `v2-read` / CancelMutationPorts)

## Context

ADR-014 / ADR-016 / ADR-017 closed Customer Request V2 write, preparation, and the three
named read-projection residuals. WAVES-43–49 still parks **RouteMandate issue / revoke /
history** on `convex/customerRequestRouteMandate.ts` (~873 lines). Lifecycle supersession
already lives in thin `convex/customerRequestRouteMandateLifecycle.ts` (~76) and MUST stay
out of this deepen.

Three correctness-critical Convex surfaces remain host-owned orchestration today:

| Export | Host | Role |
|--------|------|------|
| `issue` | `convex/customerRequestRouteMandate.ts` | `internalMutation`: authenticate owner (Clerk or service assertion), idempotent issue-command replay, current generation + graph currency gates, active-head replacement integrity, compile + persist RouteMandate |
| `revoke` | same | `internalMutation`: authenticate owner, idempotent revocation-command replay, current-head gate, append customer revocation + command |
| `getHistory` | same | `internalQuery`: authenticate owner, bounded issue + revocation history with integrity |

Pure decision helpers already live outside the host and MUST remain the authority
(do not re-encode):

| Concern | Pure home | Role |
|---------|-----------|------|
| RouteMandate compile / verify / authority scope | `src/modules/customer-request/route-mandate.ts` | Ownership of mandate material, digests, compile refusals |
| Route-plan generation predicates | `src/modules/customer-request/route-plan-generation.ts` | Generation internal consistency / request match (used by open-current) |
| Issue / revocation record integrity | `convex/customerRequestRouteMandateIntegrity.ts` | Content-address + head/issue/revocation alignment (adapter-only) |

Shared host helpers used by undeepened siblings and other Convex adapters today
(`getCurrent` / `getCurrentForPrincipal`, standing-route policy, admission, dispatch /
cancel / journal ports):

| Helper | Role |
|--------|------|
| `authenticateRequestOwner*` | Owner / delegated / service-assertion auth |
| `openCurrentRouteGeneration` | Verified current aggregate + generation open |
| `persistRouteMandateIssue` | Issue row + head + command insert |
| `readCurrentRouteMandateState*` | Current mandate projection for reads / admission |

Callers today (must keep working through the **same Convex export identities**):

- Application confirm-route → `internal.customerRequestRouteMandate.issue`
- Integration + `convex/customerRequestRouteMandate.test.ts` → `issue` / `revoke` / `getHistory` / `getCurrent`
- Standing-route, admission, route-execution adapters import shared helpers from the mandate host

CONCERNS and the campaign hard bans forbid:

1. **Shallow Convex sibling chops** — e.g. `customerRequestRouteMandateIssue.ts` without module ports.
2. **Write-plan DTOs in pure modules** — `WritePlan` / `intendedPatches` / patch arrays.
3. **Reopening ADR-014 / ADR-017** — do not fold mandate issue into V2 WritePorts or ReadPorts.
4. **Thickening lifecycle** — do not move `supersedeCurrentRouteMandate` orchestration into this family; lifecycle stays thin and adapter-called only.
5. **Parallel mandate compilers** — do not invent a second compile path; reuse `route-mandate.ts`.

Wave 48 is design-only (this ADR). Wave 49 implements under these constraints.

## Decision

### 1. Dedicated RouteMandateMutationPorts (Wave 49) — one family only

Wave 49 SHALL deepen the three exports so that:

1. The Convex host exports remain the sole public registrations (same names, same
   `internal.customerRequestRouteMandate.*` paths). `issue` / `revoke` stay
   `internalMutation`; `getHistory` stays `internalQuery`.
2. Handler bodies become thin: validate args (host validators), construct mutation ports,
   call one module machine function, return its result.
3. Orchestration lives under `src/modules/customer-request/route-mandate-mutation/`,
   **reusing** `route-mandate.ts` compile / authority-scope helpers — not duplicating digests.
4. Persistence, auth, current-generation open, graph status, and history loads go only through
   **RouteMandateMutationPorts**, implemented by `convex/customerRequestRouteMandatePorts.ts`.

**Locked names**

- Ports type: `RouteMandateMutationPorts`
- Adapter file: `convex/customerRequestRouteMandatePorts.ts`
- Factory: `routeMandateMutationPorts(ctx)`

**Do not** invent a parallel RouteMandate compiler or re-thicken Application confirm-route.

**Stop condition:** if the mandate ports adapter approaches ~1k lines mid-wave, split shared
auth / open-current / persist helpers into a second file under **this same ADR** — do not
fold into V2 WritePorts / ReadPorts, and do not open `getCurrent` deepen in the same split.

### 2. Shared auth / open-current / persist helpers move to the ports adapter home

The shared helpers listed above SHALL live in (or adjacent to)
`convex/customerRequestRouteMandatePorts.ts` as the persistence/auth authority for this host.

- The mandate host MUST **re-export** those helpers so standing-route, admission, and
  route-execution adapters keep importing from `./customerRequestRouteMandate`.
- Undeepened `getCurrent` / `getCurrentForPrincipal` MAY keep calling the shared helpers
  directly until a later wave — they are **out of Waves 48–49 scope**.
- `customerRequestRouteMandateLifecycle.ts` remains untouched; supersession stays there.

### 3. No parallel compiler; no Application re-thickening

Wave 49 MUST keep Application confirm-route ports as the seam that continues to
`ctx.runMutation(internal.customerRequestRouteMandate.issue)`, and MUST NOT create a second
mandate compiler or fold issue/revoke machines into Application modules.

### 4. No `WritePlan` / `intendedPatches` in the mutation module

Ports expose **semantic, immediately executed** auth / load / verify / persist operations.
Thinness tests SHALL forbid write-plan DTO tokens and Convex runtime under the mutation
module home.

### 5. Convex validators stay in the mandate host forever

All `v.*` validators for these three exports remain in `convex/customerRequestRouteMandate.ts`.

### 6. Preserve atomicity, integrity digests, conflicts, and replay semantics

Within a single handler invocation, all port-backed reads and writes share the same
`MutationCtx` / `QueryCtx` transaction. Replay, conflict kinds, integrity throws, graph
currency, active-head replacement, and history bounds MUST match pre-deepen semantics.
Waves 48–49 do **not** change public claim surface, lifecycle supersession, or
`getCurrent` behavior.

### 7. Forbid shallow Convex sibling chops; V2 and lifecycle untouched

Rejected: `customerRequestRouteMandateIssue.ts`, `customerRequestRouteMandateRevoke.ts`,
or any pass-through without module ports.

Allowed Convex growth: thin `customerRequestRouteMandatePorts.ts` plus the existing host
register (and optional helper split under this ADR only).

**Explicitly forbidden:** extending `CustomerRequestV2WritePorts` / ReadPorts, editing
lifecycle supersession for this deepen, or inventing synonym port type names.

### 8. How callers use the seam

**Call sites do not change.**

```text
Application confirm-route / integration / mandate tests
  → ctx.runMutation(internal.customerRequestRouteMandate.issue, args)
      → host validator + routeMandateMutationPorts(ctx)
      → route-mandate-mutation.issue(args, ports)     // Wave 49
      → result

  → revoke | getHistory
      → route-mandate-mutation.* via RouteMandateMutationPorts
```

Application MUST NOT import mutation machines or construct mandate mutation ports.
Machines MUST NOT import Convex `_generated` or host files.

### 9. Status and wave gating

**Status: Accepted.** This ADR is the design unlock for Wave 48 and implement authority for
Wave 49.

| Wave | Allowed work |
|------|----------------|
| **48 (this ADR)** | Design only; **no** machine/port code in the ADR-only commit |
| **49** | Implement ports + machines + adapter; thin host shells for issue / revoke / getHistory; move shared helpers to ports adapter home; thinness locks; mandate tests green |
| **50+** | Out of this ADR (`getCurrent` deepen, standing-route deepen, legacy retirement) |

**Out of Waves 48–49:** `getCurrent` / `getCurrentForPrincipal` deepen, standing-route policy
host, lifecycle supersession changes, ADR-014 / ADR-017 reopen, Application validator
relocation, public claim changes, notification-outbox families.

**Deletion test (Wave 49 exit):** removing issue / revoke / getHistory orchestration from
`customerRequestRouteMandate.ts` must concentrate that complexity in the module mutation
cluster + RouteMandateMutationPorts adapter (or fail tests). A Convex sibling chop without
ports fails this test.

## Consequences

### Easier

- Wave 49 shrinks mandate host glue for issue / revoke / history without write-plan DTOs or
  sibling chops.
- Issue / revoke stay testable with port fakes; production atomicity stays one mutation.
- Existing `route-mandate.ts` compile / verify remain decision authority.
- Shared auth / open-current / persist have one home; other Convex adapters keep stable
  import paths via host re-exports.

### Harder / constrained

- Ports adapter must not bleed into V2 Write/Read or thicken lifecycle.
- Shared helpers used by undeepened `getCurrent` and standing/admission must remain exported.
- Application thinness remains: confirm-route still only `runMutation` the public issue export.

### Explicit non-goals

- Deepening `getCurrent` / standing-route in the same waves.
- Changing Application public behavior or Convex function paths.
- Moving or rewriting `supersedeCurrentRouteMandate`.
- Growing V2 WritePorts / ReadPorts to absorb mandate issue.
- Synonym names — lock `RouteMandateMutationPorts` + `customerRequestRouteMandatePorts.ts`.

## Rejected alternatives

### A. Split host into `customerRequestRouteMandateIssue.ts` / revoke siblings

Rejected: shallow pass-through; CONCERNS hard ban; fails deletion test.

### B. Return `WritePlan` / `intendedPatches` from modules

Rejected: pollutes pure modules; multi-step apply risk; thinness bans.

### C. Move validators into `src/modules`

Rejected: validators stay in the mandate Convex host forever.

### D. Invent a parallel RouteMandate compiler

Rejected: one canonical compile path in `route-mandate.ts`.

### E. Application calls mutation machines directly (bypass mutations)

Rejected: breaks transactional atomicity and `internalMutation` authority.

### F. Fold mandate issue into `CustomerRequestV2WritePorts` / `v2-write/`

Rejected: wrong host and table set; WritePorts closed; mandate supersession already ports-only
via lifecycle.

### G. Deepen lifecycle supersession in the same waves

Rejected: lifecycle already thin; WAVES-43–49 explicitly parks it out of scope.

### H. Deepen `getCurrent` + issue/revoke in one wave

Rejected: one family per implement wave; current-projection deepen is a later residual.

### I. Implement Wave 49 without Accepted ADR-018

Rejected: design unlock required before mandate mutation move.

## Verification expectations (Wave 49, not the ADR-only commit)

1. Host still exports `issue` / `revoke` / `getHistory`; bodies delegate via
   `RouteMandateMutationPorts`.
2. Mutation-module home free of write-plan tokens and Convex runtime.
3. Thinness: thin handlers; ports adapter `<= 1000` lines; no mandate Issue/Revoke sibling hosts.
4. Shared auth / open-current / persist / current-state helpers live under the ports adapter
   home; host re-exports for standing / admission / route-execution.
5. `customerRequestRouteMandateLifecycle.ts` untouched.
6. Mandate unit + convex mandate tests stay green; replay / conflict / integrity / graph /
   history semantics match pre-deepen.
7. Call paths remain `internal.customerRequestRouteMandate.*`.
8. `npm run check:convex-codegen` green; Wave 49 deletion / thinness test passes.

## Decision record

Accepted 2026-07-18 as Wave 48 design unlock. Wave 49 implements under this ADR only.
ADR-014 / ADR-017 remain authority for V2 write / read residuals and are not amended.
Lifecycle supersession remains in `customerRequestRouteMandateLifecycle.ts`. This document
covers the RouteMandate **issue / revoke / history** residual. `getCurrent` deepen and
standing-route host deepen require later ADRs.
