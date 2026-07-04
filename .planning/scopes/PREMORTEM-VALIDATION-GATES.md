# Premortem + Validation Gates — Five ROI Scopes

**Status:** pre-execution validation register.  
**Scope:** applies to `.planning/scopes/scope-01-*` through `scope-05-*`.  
**Evidence basis:** `PRODUCT.md`, `.planning/archive/root/PRODUCT-10-STAR.md`, `local://five-scopes.md`, ADR-001..ADR-005, all five scope indexes/plans, read-only reviewer passes `ProductPremortem`, `Scope12Validation`, `Scope3Validation`, `Scope4Validation`, and `Scope5Validation`.

This file is a gate register, not an implementation plan. It exists to stop cheap-to-detect failures before code starts. A **KILL** verdict freezes the affected downstream implementation scope for founder ruling. An **ADAPT** verdict rewrites the relevant plan/index before implementation continues. A **GO** verdict records evidence and lets the planned implementation proceed.

## Global validation rules

1. **Scope 1 hardening may proceed while validation runs.** It converts existing source/local proof into deployable proof and clears substrate blockers.
2. **Scopes 2–5 build work cannot start on a KILL verdict** from any global gate that applies to it. Decision spikes may run only if they do not hide or bypass the failed gate.
3. **Source/local, deployed test-mode, deployed provider, and live/production proof stay separated** in every summary and evidence artifact.
4. **Public promise stays inside AE's trust contract:** read, compare, summarize, route, and qualified inquiry; no booking, payment, dispatch, auto-fulfilment, broad marketplace, wallet, settlement, or unqualified `verified` claim.
5. **Launch wedge must be narrow enough to recruit, but schemas stay wedge-agnostic.** No service-shaped fields such as urgency/jobSuburb enter the core inquiry, thread, capability, action, or receipt models without a later explicit decision.

## Global gates

| ID | Failure cause | Disposition | Applies before | GO | ADAPT | KILL / escalate |
|---|---|---|---|---|---|---|
| PM-01 | Owner-side supply pull is assumed; AE builds rails around an empty room. | New validation ticket | Scope 2 build, Scope 3 public posture widening, Scope 4, Scope 5 | Contact 20 target owners in one named wedge; at least 5 complete a concierge claim/listing and at least 3 agree to respond to a real qualified inquiry within 24h. | 2–4 owners claim, or interest is only for a free page and not inquiry response; change wedge, geo, promise, or onboarding script and rerun. | 0–1 owners claim or owners reject the channel as not worth checking; freeze S2–S5 and revisit wedge/product loop. |
| PM-02 | Assistant-readable artifacts do not become assistant distribution. | New validation ticket | Scope 2 discovery, Scope 3 agent-door public posture, Scope 4/5 agent readback/propose surfaces | Across target assistant/search surfaces, at least two can discover/cite AE for exact or near-exact wedge queries, and boundary wording survives summarization. | Assistants preserve facts only when given a URL/structured data; prioritize SEO/schema/llms/citation work before deeper agent-door expansion. | Assistants neither discover nor preserve AE facts/boundaries; treat demand acquisition as manual/SEO until a distribution channel is proven. |
| PM-03 | Launch wedge ambiguity splits product validation from implementation. | Design change now | Any Scope 2–5 implementation beyond resolution spikes | A one-sentence v1 launch wedge and one-sentence not-yet list exist; fixtures/demos name the wedge while core schemas stay wedge-agnostic. | Founder wants broad agent-native businesses; replace local-trades H0 gates with gates for that actual wedge and strip trades-only assumptions from execution prep. | No first supply ICP can be named; freeze S2–S5 because capability, endpoint, thread, and receipt validation have no target. |
| PM-04 | Hands ship before meat: threads/receipts look elegant but no owner wants to use them twice. | Design change now | Scope 4 04-02+, Scope 5 05-02+ | At least one real owner/business agrees to replay the exact thread/receipt demo with its own words/constraints; no money proof required. | Owner wants communication but not receipts; execute Scope 4 and postpone Scope 5. Owner wants a simple external next step; keep receipt verifier source/local only. | No owner will replay the thread/receipt demo concierge-style; freeze S4/S5 and invest in supply/owner workflow first. |
| PM-05 | Combined scope story dilutes the trust contract. | New validation ticket | Any public/demo copy or agent-tool descriptor changes | Three uninvolved reviewers read the planned copy/promise deck and accurately answer: no booking, no payment, no dispatch, no auto-fulfilment, no unqualified verification; only gated inquire/propose/readback. | Any label implies payment, booking, broad autonomy, marketplace liquidity, or protocol theater; rename before coding and add the term/pattern to scans. | The combined story cannot be explained without public internal vocabulary or overclaim; freeze public/demo work and rewrite the narrative. |

### Current verdict snapshot — 2026-07-04

| Gate | Current verdict | Evidence pointer | Still blocks |
|---|---|---|---|
| PM-01 | **OPEN / not proven** | none | S2-S5 product proof and owner-response claims. |
| PM-02 | **OPEN / not proven** | none | Assistant distribution, public posture, readback/propose expansion. |
| PM-03 | **GO** | `.planning/scopes/PM-03-launch-wedge-lock.md` | No longer blocks if consumers keep schemas wedge-agnostic and proof levels separated. |
| PM-04 | **OPEN / not proven** | none | Scope 4 04-02+ and Scope 5 05-02+ product-demo proof. |
| PM-05 | **ADAPT** | `.planning/scopes/PM-05-trust-language-red-team.md` | Public/demo copy and assistant-visible descriptors until renames/scans and reviewer evidence land. |
| S2-G3 | **GO for source-local 02-02/02-04 consumption** | `.planning/archive/scopes/scope-02-capability-registry/S2-G3-wedge-agnostic-contract-pack.md` | Any service-shaped capability-table leak or operationMode-as-trust behavior. |
| S3-G2 | **ADAPT** | `.planning/archive/scopes/scope-03-handshake-identity-clearance/S3-identity-preflight.md` | Route integration that trusts `web-bot-auth.verify()` alone, non-OpenAI initial signers, or untyped signature failures. |
| S3-G4 | **GO** | `.planning/archive/scopes/scope-03-handshake-identity-clearance/S3-identity-preflight.md` | Any code path where signed identity authorizes a verb. |

### Retired / deliberately visible risks

| Risk | Disposition | Reason |
|---|---|---|
| Scope 1 deploy-proof debt | Retired by arithmetic as a new premortem item | It is already Scope 1's entire purpose and has concrete smoke/evidence plans. Keep executing it; do not spawn duplicate validation tickets. |
| Live-money regulatory/compliance risk | Fog/deferred | Scope 5 is source/local + Stripe test-mode only. Live mode requires a later evidence-backed money decision record and deployed provider proof. |
| Developer platform / template risk | Fog/deferred | PRODUCT-10-STAR gates builder/developer surfaces after visible demand bottlenecks. Current five scopes should not prebuild them. |

## Scope-local gates

### Scope 1 — Production landing

| ID | Failure cause | Disposition | Gate |
|---|---|---|---|
| S1-G1 | Deployed proof collapses into screenshots/env theatre. | Design change now | Create a deployed-smoke readiness ledger before 01-04: host, refs, required env, owner/support row, seeded slug, provider mode, redaction rule, expected evidence row, and fail-loud missing-input behavior for the full Scope-1 deployed evidence suite. |
| S1-G2 | Authz migration or source-state guard breaks substrate during rollout. | Design change now | Before narrowing identity reads or deleting collect fallbacks, record dual-read window, wrong-issuer proof, tokenIdentifier membership checks, indexed lookup path per persisted table, fallback-used metric, and rollback/narrow criteria. |

### Scope 2 — Capability registry

| ID | Failure cause | Disposition | Gate |
|---|---|---|---|
| S2-G1 | Scope 2 outruns Scope 1 substrate. | New validation ticket | Maintain a cross-scope lock table: 02-01 may resolve tickets/source model; 02-02+ waits for Scope 1 source substrate; deployed/provider capability proof waits for Scope 1 deployed env. |
| S2-G2 | Capability external fetch becomes SSRF/injection/freshness/contradiction substrate. | New validation ticket | Before 02-03, build a fixture pack for `ae-endpoint-check:v1`: private/link-local/loopback/rebind/redirect/oversize/content-type/schema mismatch/stale/contradicted/unreachable/unsupported cases with expected trust states and no dispatch. |
| S2-G3 | Wedge-agnostic capability shape erodes through service exceptions or `operationMode`. | New validation ticket | Before 02-02/02-04, validate three-business fixture matrix: local service, software/content/agency, and commerce/ops business; no serviceArea/suburb/hours/urgency/emergency/job fields in capability tables; operationMode remains orthogonal disclosure. |

### Scope 3 — Agent identity, mandates, per-action clearance

| ID | Failure cause | Disposition | Gate |
|---|---|---|---|
| S3-G1 | Kernel package acquisition smuggles unsupported money/MCP/customer-edge surfaces. | New validation ticket | Exact package/version or vendored dist provenance; imports only root + `/adapter-sdk`; scans fail on `x402`, `mcp`, `http`, customer-edge/cloud adapter, wallet, `viem`, and provider-specific money surfaces in AE runtime. |
| S3-G2 | Web Bot Auth signer reality does not match parser/library/route headers. | New validation ticket | Current signed fixture verifies through pinned parser + AE policy checks; malformed/bad/unknown-key cases fail closed; unsigned reads remain read-only; unsigned writes return typed 403 + `Accept-Signature`; route/proxy preserves signature headers. |
| S3-G3 | Convex/CAS spike passes without proving single-use authority is race-safe. | Design change now | Spike must prove real Convex table/index CAS or deterministic action + one terminal internal mutation for greenlight consumption, idempotency, stream offset, operation claim, and receipt index. Replay same key must have no second consequence. |
| S3-G4 | `agentIdentity` becomes authority at dispatch. | Design change now | Review/test action registry + approval policy: signed identity changes attribution/quota/audit only. Signed-but-unmandated writes refuse with typed reason. Agent-tools snapshot adds no new verbs. |
| S3-G5 | Signing/key custody or vocabulary turns internal proof into public trust claim. | Design change now | #21 records key posture, dedicated env/rotation/fail-closed behavior, redaction rules, and D9 scans across human surfaces, quiet tools JSON, action boundaries, llms/agent payloads, and route readbacks. |

### Scope 4 — Communication rail

| ID | Failure cause | Disposition | Gate |
|---|---|---|---|
| S4-G1 | Index/plans claim #22–#28 are resolved while ADR-004 still has open questions. | Design change now | Before 04-02, ADR-004 has concrete `Resolution:` lines for #22–#28, GitHub issues are closed, and map issue #1 has a line per decision. Otherwise return to 04-01. |
| S4-G2 | Business endpoint trust envelope depends on unresolved Scope 2 semantics. | New validation ticket | Pre-code dispatchability matrix from Scope 2 facts: checked/fresh, stale, contradicted, unsupported, unreachable, redirected, private/loopback/link-local/DNS-rebound, and non-registered URL. Only exact registered + checked/fresh endpoints dispatch. |
| S4-G3 | Outbox state cannot support the intended delivered/read claims. | Design change now | Pure state-machine fixture before adapter work: endpoint 2xx maps to the chosen public state, failures retry/backoff/dead-letter, read remains cursor-gated, and `triggered|sent` is not reused to imply read/delivery beyond its semantics. |
| S4-G4 | Anonymous readback bearer tokens leak PII/thread state. | New validation ticket | Tabletop token mint, URL delivery, route access, cursor advance, tombstone/close, expiry, foreign thread refusal, no-store/no-referrer, log/referrer scrubbing, hashed storage, and own-redacted-contact-only projection. |
| S4-G5 | Demo/provenance/quote copy looks like booking, payment, dispatch, or a fake business agent. | New validation ticket | Copy/provenance fixture before UI: human owner reply, real business-agent reply, AE-operated demo reply, assistant-submitted inquiry, quote, and acceptance with Scope 5 absent/gated. |

### Scope 5 — Transactions + receipts

| ID | Failure cause | Disposition | Gate |
|---|---|---|---|
| S5-G1 | Hackathon demo proves sponsor rails, not AE's trust wedge. | New validation ticket | Before 05-04, run a demo tabletop: each visible step maps to a source row and a user/business value; deleting seeded rows breaks the demo. Audience can explain AE's receipt/trust role without saying it is only a Stripe/Hermes demo. |
| S5-G2 | Hackathon path and product wedge drift apart. | New validation ticket | Before 05-01 closeout and 05-04 README, write wedge mapping: buyer/operator/business, repeated real behavior represented, product horizon proved, and claims explicitly not proved. |
| S5-G3 | `businessAction.propose` becomes reachable before Scope 3 identity/mandate. | Design change now | Scope 5 may author private seams only. Any registration/exposure requires Scope 3 completion artifact proving attributed principal, mandate refusal, and deliberate agentTools snapshot diff. |
| S5-G4 | Public receipt verifier leaks private evidence or is enumerable. | Design change now | Decide public verification identifier before route work: non-enumerable holder token/hash, no list route, rate-limit posture, field allowlist, and success/refusal/tamper/proof-gap sample readbacks with private payloads absent. |
| S5-G5 | Stripe/test-mode/source-local proof gets described as live payment or production trust. | New validation ticket | Every summary/demo/route copy has an evidence matrix: claim, proof level, provider mode, public-copy permission, missing deployed/live gate. Any live/production/checkout/wallet/settlement implication is rewritten before implementation continues. |

Two-slug widening is **accepted residual / retired by arithmetic** if it stays exactly two closed, individually admitted slugs and the second slug is documented as a verifier-widening proof, not a product catalog or broad action surface.

## Success tape

Total success is not "AE has Handshake, endpoints, threads, and receipts." Total success is: a real fragmented small-counterparty business treats AE as its agent-readable front door; a customer or assistant finds it through AE; the owner responds because the inquiry is better than incumbent lead spam; the same trust/evidence/receipt spine can later support mandate-bound paid actions without pretending to book, dispatch, charge, or auto-fulfil. The five scopes must preserve one wedge-agnostic architecture while validating one brutally narrow launch wedge.
