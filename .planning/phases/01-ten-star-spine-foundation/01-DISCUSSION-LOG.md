# Phase 01: ten-star-spine-foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 01-ten-star-spine-foundation
**Areas discussed:** Existing context/plan purge, PR slicing after purge, Owner page/status posture, Registry/API/search contract, Operator repair/admin posture, Fable/Matt review gates, Fable 5 docs auto review

---

## Existing Context and Plan

| Option | Description | Selected |
|--------|-------------|----------|
| Create canonical 01-CONTEXT | Use existing kickoff context as prior input and write canonical workflow output. | |
| View existing context | Show existing `CONTEXT.md` before deciding. | ✓ |
| Skip | Leave context unchanged and stop. | |

**User's choice:** View existing context.
**Notes:** Existing kickoff `CONTEXT.md` was displayed.

| Option | Description | Selected |
|--------|-------------|----------|
| Continue and replan after | Capture context now; future plan-phase can revise/add downstream PR plans. | |
| View existing plan | Show existing PR00 plan before deciding. | ✓ |
| Cancel | Stop without writing new context. | |

**User's choice:** View existing plan.
**Notes:** Existing `01-01-source-mining-ledger-PLAN.md` was displayed.

| Option | Description | Selected |
|--------|-------------|----------|
| Proceed | Create canonical context and leave existing PR00 untouched. | |
| Skip | Keep only existing kickoff context, PR00 plan, and SPEC. | |
| Cancel plans first | Stop so PR00 can be removed/reworked manually. | |
| Free text | User supplied custom direction. | ✓ |

**User's choice:** “lets purge and rewrite”
**Notes:** Old kickoff `CONTEXT.md` and old PR00 plan were deleted. Source-mining ledger remains as completed evidence.

---

## PR slicing after purge

| Option | Description | Selected |
|--------|-------------|----------|
| PR00 done; start PR01 | Treat source-mining ledger as completed context; do not recreate old PR00. | ✓ |
| Recreate PR00 verify-only | Add a tiny PR00 plan that only verifies the ledger. | |
| Collapse PR00+PR01 | First plan both verifies source-mining and creates substrate. | |

**User's choice:** PR00 done; start PR01.
**Notes:** Later clarified as renumbering from `01-01` substrate.

| Option | Description | Selected |
|--------|-------------|----------|
| Renumber from 01-01 substrate | Delete old PR00/PR01 labels in executable plans; first new plan is substrate+guardrails. | ✓ |
| Preserve PR labels | Keep PR00 closed in docs and start executable plan names at PR01. | |
| Single master plan only | Avoid PR-specific plans and keep one rewritten master plan. | |

**User's choice:** Renumber from 01-01 substrate.
**Notes:** Master `PHASE.md` remains context, not a broad executor.

---

## Owner page/status posture

| Option | Description | Selected |
|--------|-------------|----------|
| Outcome-first readback | Plain owner language: what is public, what is not live, why demand may be missed, next action. | ✓ |
| Technical status console | More explicit status taxonomy surfaced to the owner. | |
| Marketing landing page | Persuasive launch copy first, health details secondary. | |

**User's choice:** Outcome-first readback.

| Option | Description | Selected |
|--------|-------------|----------|
| One-screen status card | Public URL, service status, index/discovery status, unavailable capability, next action. | ✓ |
| Full status dashboard | Multiple panels/tabs for every state and audit readback. | |
| Public page only | Owner infers status from public page and registry. | |

**User's choice:** One-screen status card.

---

## Registry/API/search contract

| Option | Description | Selected |
|--------|-------------|----------|
| Strict shared DTO | One allowlisted catalog DTO feeds page, registry, API, llms, UCP, sitemap. | |
| Separate API DTO | Allow API/search to use a distinct read model if faster. | |
| Search-quality first | Invest early in richer ranking/fuzzy search. | |
| Free text | User supplied custom direction. | ✓ |

**User's choice:** “strict but measure everything”
**Notes:** Interpreted as strict shared DTO plus privacy-safe telemetry.

| Option | Description | Selected |
|--------|-------------|----------|
| Privacy-safe event stream | Record attribution/search/click/API/manifest/share/status events with redacted payloads. | ✓ |
| Full request logs | Keep richer raw logs for debugging. | |
| Aggregate counters only | Store counts only. | |

**User's choice:** Privacy-safe event stream.

---

## Operator repair/admin posture

| Option | Description | Selected |
|--------|-------------|----------|
| Block until controls exist | No public discovery until admin, suppression, operator controls, audit, and repair readbacks exist. | ✓ |
| Expose after claim/publish | Public pages/API first; admin/repair shortly after. | |
| Manual ops first | Manual DB/deploy intervention for alpha. | |

**User's choice:** Block until controls exist.

| Option | Description | Selected |
|--------|-------------|----------|
| Queues + repair actions | Claims queue, audit, index/discovery health, suppression, controls, retry/regenerate. | ✓ |
| Read-only queues | Inspect issues, repair deferred/manual. | |
| Suppression only | Only emergency hide/unhide before discovery. | |

**User's choice:** Queues + repair actions.

---

## Fable/Matt review gates

| Option | Description | Selected |
|--------|-------------|----------|
| Gate plan and closeout | Fable/premortem before rewritten plan; Matt Standards+Spec before closeout. | ✓ |
| Closeout only | Run both after implementation is complete. | |
| Every PR | Run both on every PR slice. | |

**User's choice:** Gate plan and closeout.

| Option | Description | Selected |
|--------|-------------|----------|
| Written findings register | Plan review has findings with owner/disposition/SPEC link; closeout proves disposition. | ✓ |
| Lightweight checklist | Informal checklist without artifact. | |
| External review only | External model review without local findings register. | |

**User's choice:** Written findings register.

---

## Fable 5 docs auto review

**User interjection:** “what would fable 5 do to make this the architeced, engineered, 10 star product. this informs our decision making. grill with docs auto mode that fable 5 runs”

**Action:** Ran five parallel review lenses in docs auto mode:

| Lens | Agent | Result |
|------|-------|--------|
| Founder/product truth | FableFounder | Incorrect until first-request promise, real-owner alpha proof, owner-language status copy, route parity, and urgent-trades T0 facts are locked. |
| Stripe/platform architecture | FableStripe | Incorrect until operation-key state machine, single audit authority, admin bootstrap, typed repair dispatch, and scanner allowlist are locked. |
| Matt Pocock/deep module | FableMatt | Incorrect until catalog DTO ownership, route/Convex seam rules, ledger authority, branded primitives, and public seam files are locked. |
| Security/reliability premortem | FableSecurity | Incorrect until contention gate, redacted audit snapshots, fresh discovery readback, cache-safe suppression, and data-only owner text are locked. |
| AI discovery/SEO/GTM honesty | FableAIGTM | Incorrect until public first-request target, AU locality tuple, public-surface telemetry, global discovery projections, and freshness/version signals are locked. |

**Decision:** Accept all Fable 5 findings into `01-CONTEXT.md` and create `FABLE-5-FOUNDATION-REVIEW.md` as the findings register.

---

## Claude's Discretion

None. User selected concrete options or directed docs auto mode; auto-mode Fable findings were accepted.

## Deferred Ideas

None newly added. Existing out-of-scope items remain deferred to later phases: inquiry/inbox, payments, protected actions, developer/API-key/MCP/OpenAPI surfaces, hosted agents, voice/persona, SDK/plugin surfaces.
