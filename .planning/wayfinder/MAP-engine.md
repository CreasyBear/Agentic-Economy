> **SUPERSESSION BANNER — 2026-08-08.** This file is retained for historical
> mechanics and evidence provenance only. It is **not current authority** for
> AE's product category, ICP, wedge, supplier model, or roadmap.
>
> Current authority is [`PROJECT.md`](../PROJECT.md),
> [`VISION-conceptual-map.md`](../VISION-conceptual-map.md),
> [`wayfinder/MAP.md`](MAP.md), [`D-013`](../records/PROJECT-RECORDS.md), and
> the [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md).
> Do not infer from this historical map that local trades, Australian SMBs, BAS,
> or a one-human-work wedge is the current category or default product frame.

# Wayfinder map — Agent engine on `/` (non-mechanical AE)

Label: `wayfinder:map` (local-markdown tracker fallback; `gh` still unauthenticated — see [T1](tickets/T1-gh-auth.md)).
Charted: 2026-07-31. Successor effort to [the parity map](MAP.md), whose destination was reached and redrawn.

## Destination

**Phase 1 live:** a person lands on `/`, goes through a dialog, and the agent uses tool calls and queries to build a plan/proposal against onboarded businesses' endpoints and offerings — bounded model segments propose, the deterministic kernel disposes. Supply bar: seeded sandbox **plus one self-onboarded real AE-operated endpoint** through the supply funnel. The dialog evolves the existing `/` answer thread — no new surface.

## Notes

- Execution is in scope up to the destination (this map carries the build, like waves 1–5), not beyond it.
- Governing evidence, consult before designing: `.planning/research/2026-07-31-agent-engine-verdict.md` (adjudicated D1–D6), `2026-07-31-eval-stack-bet.md` (stack: AI SDK v7 transport-only + OR provider v3 + convex workflow/workpool later + oh-my-pi patterns), `2026-07-31-agent-engine-authority.md` (approval seam), `2026-07-31-agent-engine-loops.md`, `-durability.md`, `-commerce.md`, `-counterevidence.md`.
- Hard invariants: kernel owns action selection/budgets/stages/approval/idempotency; model emits typed proposals only; Convex is the single source of truth; candidate menus ≤ ~7; deterministic fast path for predictable asks stays zero-model; disclosure is an effect; business replies are quarantined (fog-relevant).
- Every session must consult: `wayfinder`.
- Standing preference (founder, after ~30 pivots): stop re-architecting. The verdict docs are the architecture; tickets refine within it, they do not reopen it.

## Decisions so far

<!-- one line per closed ticket -->
- [T17](tickets/T17-model-tiering.md): GPT-5.4 nano intent, GPT-5.4 mini strict-schema proposal, Claude Haiku 4.5 prose; Gemini fallbacks; hard $0.06/turn and p95 model budgets within the 8s useful-token target.
- [T14](tickets/T14-effect-metadata.md): `ActionEffectMetadata` (class/reversibility/recipient/data/spend/approval) on every registered action; read-only actions provably non-consequent.
- [T15](tickets/T15-ai-sdk-adoption-gate.md): AI SDK v7 + OR provider v3 as transport-only seam (option A); adversarial gate green — hostile/replayed/cyclic proposals refused pre-dispatch, refinement stays zero-model.
- [T16](tickets/T16-proposal-contract.md): typed proposal union + kernel menus/budgets; plans persist in `enginePlans`/`enginePlanEvents` (revision lineage, digests, append-only events, operationKey idempotency, session-scoped reads, execution-time expiry).
- [T18](tickets/T18-dialog-ux-prototype.md): founder direction — subtle inline plan work (`AePlanWork`), full plan behind disclosure, question as agent speech, ask box is the reply affordance.
- [T19](tickets/T19-eval-suite.md): `npm run test:eval:engine` — 20 asks through production seams, scores replayed from persisted events; pass^k table + real-model run remain open follow-ups.
- [T20](tickets/T20-self-onboarded-endpoint.md): AE Demo Services live at `agentic-economy-phi.vercel.app/api/demo-provider/*` (hosted 200s captured in `output/eval/t20-evidence.json`); funnel handlers landed; owner-credential publication is the open HITL step.
- [T21](tickets/T21-engine-segment-live.md): engine live on `/` behind `AE_ENGINE_PROPOSALS` — plan card + dialog verified in the dev journey; flat transport schema + kernel input normalization were the provider-reality lessons; DeepSeek v4 flash primary per founder (privacy toggle pending).
- Builder/critic doctrine adopted (founder, 2026-07-31): `.planning/DOCTRINE-builder-critic-loop.md` — blind side-by-side vs DIY human (headline) and bare assistant; first ultraloop axis: ask → plan.
- Ultraloop 2 (2026-07-31, blind judge vs GPT-5.4/Claude/Perplexity/Gemini — `output/eval/ultraloop2/verdict.md`): AE **wins outright where supply exists** (dentist: real bookable option in 231ms beat every rival) and loses where supply is absent or the ask is open (1 win, mean rank 3.83). Judge's law: "verified live facts when the job is local and supply-specific; a sharp decision process when it is not." Web knowledge decisive in exactly the no-supply asks → [T23](tickets/T23-web-discovery-imported-claims.md). Copy/recovery gaps → [T24](tickets/T24-clarify-copy-and-recovery.md).
- DeepSeek v4 flash live as primary proposal model (json_object mode + schema-in-prompt; strict-schema chain for GPT/Gemini): accepted proposal at $0.00067/call, 3.6s — ~50× cheaper than GPT-5.4-mini.
- [T23](tickets/T23-web-discovery-imported-claims.md): registered `web.discover` observation recovery after empty supply; cited results persist/render as Imported Claims with invite-to-list links; each claim is now bound to its own provider citation.
- Ultraloop 3 (2026-08-01, `output/eval/ultraloop3/verdict.md`): authoritative voice, proposal fallback hardening, and T23 shipped, but blind customer value regressed to AE 1 win / mean rank 4.33. Exact failure: recovery is still described rather than executed; plan cards can terminate with pending steps; development fixture supply is not customer evidence. T24 remains open on executable carry-forward.
- Brand LOCKED (founder grilling session, 2026-08-01, `.planning/BRAND.md`): decomposition thesis — soul is the decided path; hero names the universal moment (“Where do we even start?”); core sentence carries the full destination promise; one brand on three doors (person → agent → business); instances are furniture in `src/content/brand-copy.ts` (locked starting set: wedding-120, café, BAS, tooth, interstate move); PM provenance is internal DNA, PM vocabulary prohibited in copy; copy managed per `.planning/COPY-MAP.md`; ask box parked.
- Vision confirmed (founder, 2026-08-01, `.planning/VISION-conceptual-map.md`): AE productizes the eleven PM primitives as a durable, long-running decision tree people come in and out of — grill → map → studies → decide → commit → wayfind → receipts; trust ratchets one notch per act; "the tree of unknowns narrowing until only their taste-decisions remain, and then things happening."

## Not yet specified

- **Async human-business inquiries** (email/chase for non-API businesses): in scope, not ticketable until Phase 1 teaches us the plan-step shape. The proposal/plan model should anticipate `pending` steps; the durable state machine, outbox/reply quarantine, reminder policy, and pilot inquiry type graduate here.
- **Contact capture experiment**: only matters once async steps exist; design as typed blocker at first prepared disclosure, A/B the timing (evidence is split — see counterevidence F-contact findings).
- **Durable plan runtime** (`@convex-dev/workflow`/`workpool` adoption): Phase 1 plans may live within thread turns; adopt the components when plans outlast a session or async steps land.
- **Commitments** (offer → hold → confirm with receipts) and the approval UX for effectful actions: Phase 1 is read/quote-only, so the digest-bound approval seam stays mostly dormant; graduates when the first commitment-capable endpoint exists.
- **Multi-session plan resumption and notifications.**

## Out of scope

- Recruiting real external businesses onto the funnel — human/sales effort, not this map.
- Live money movement / Stripe activation — owned by the existing HITL runbook (`RUNBOOK-money-hitl.md`).
- Hosted production reachability claims — hosted readback remains T3-remainder work on the parity map.
- T10 AE-operated booking endpoints for no-API locals — fast-follow effort once the engine exists.

## Open tickets (frontier)

| id | type | title | blocked by |
| --- | --- | --- | --- |
| [T22](tickets/T22-destination-walkthrough.md) | grilling (HITL) | Destination walkthrough: founder drives the dialog end-to-end and accepts | — (unblocked) |
| [T20](tickets/T20-self-onboarded-endpoint.md) | task (HITL remainder) | Owner-credential funnel publication of the live demo endpoint | Clerk owner sign-in |
| [T24](tickets/T24-clarify-copy-and-recovery.md) | task | Clarification discipline + no-supply recovery (ask→plan ultraloop) | — |
| [T25](tickets/T25-x402-paid-tool-supply.md) | task | Engine pays for tool supply over x402 (Exa direct) — dogfood the agentic economy | funded USDC wallet (HITL) |