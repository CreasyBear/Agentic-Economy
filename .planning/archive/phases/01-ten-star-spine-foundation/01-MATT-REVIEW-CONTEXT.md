# Phase 01 Matt Pocock Review Context

**Purpose:** Prepare `/mattpocock-review` for Phase 1 closeout while keeping Standards and Spec axes separate.  
**Fixed point:** `e4d73f9` - parent of `8134856 chore(01-01): scaffold runtime substrate`.  
**Review target:** run against the current closeout `HEAD` after Plan 01-08 final documentation commits land.  
**Diff command:** `git diff e4d73f9...HEAD`  
**Commit command:** `git log e4d73f9..HEAD --oneline`

## Non-Merge Rule

The review output must have two separate sections:

1. **Standards** - documented engineering standard violations only.
2. **Spec** - Phase 1 requirement mismatches, missing behavior, scope creep, or wrong behavior only.

Do not merge, deduplicate, prioritize, or rerank findings across the two axes. A finding may appear in both sections if it independently violates both an engineering standard and the Phase 1 spec. Each axis gets its own worst issue and count.

## Standards Axis

**Question:** Does the Phase 1 diff follow the repo's documented engineering standards?

**Primary standards sources:**

- `.planning/ENGINEERING-STANDARDS.md`
- `.planning/SECURITY-SPEC.md`
- `.planning/AI-SPEC.md`
- `.planning/SEO-AEO-SPEC.md`
- `.planning/GTM-READINESS.md`
- `.planning/source-mining/phase-1-ledger.md`
- `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`
- `.planning/phases/01-ten-star-spine-foundation/01-PATTERNS.md`
- `.planning/phases/01-ten-star-spine-foundation/FABLE-5-FOUNDATION-REVIEW.md`
- `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md`

**Standards checks to keep independent from Spec:**

- TypeScript hard spec: no `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad status strings, or widened route DTOs.
- Deep-module rule: routes import public seams only; domain modules use `src/modules/<module>/public.ts`; internal imports stay private except owning public seams and approved schema composition.
- Convex rule: source-owned authority, typed validators, indexes for query paths, durable idempotency, and audit in the same logical operation.
- Route/server-function rule: routes are adapters; input/output contracts are module DTO/result unions; session/owner/admin authority is never browser supplied.
- Security rule: CSRF/origin/rate-limit controls, redacted audit, source-owned admin, suppression, dispute intake, operator controls, and privacy-safe readbacks.
- Discovery/AI rule: owner text is inert data; llms/manifest/API outputs are route-tested, suppression-aware, stale-aware, and honest about unsupported capabilities.
- GTM/copy rule: no launch-ready, demand, partner, payment, booking, verification, guaranteed response, or agent-action claims without matching source evidence.
- Review rule: report Standards findings under this axis only.

**Suggested Standards prompt:**

```text
Review `git diff e4d73f9...HEAD` for violations of the documented standards listed above. Report every hard violation and any important judgment-call violation, citing the exact standard file/rule and the changed file/hunk. Skip issues already enforced and passing through automated gates unless the diff still creates a documented standard risk. Do not discuss whether the implementation satisfies the Phase 1 spec except where a documented standard itself says so. Keep this axis separate from Spec.
```

## Spec Axis

**Question:** Does the Phase 1 diff implement the locked Phase 1 requirements and Plan 01-08 closeout work?

**Primary spec sources:**

- `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md`
- `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md`
- `.planning/phases/01-ten-star-spine-foundation/01-VALIDATION.md`
- `.planning/phases/01-ten-star-spine-foundation/01-08-gate-suite-review-alpha-readiness-PLAN.md`
- `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md`
- `.planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md`
- `.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` once created
- Phase summaries `01-01` through `01-08`

**Spec checks to keep independent from Standards:**

- Sam can claim without ABN, publish T0 emergency-service facts, land on `/{slug}`, appear in `/registry`, public APIs, `/{slug}/ucp`, and `/llms.txt`, and be suppressed from every public output.
- Public/owner UI exposes separate `publicStatus`, `trustTier`, `indexStatus`, `discoveryStatus`, service/capability status, human unavailable capability labels, and next action.
- Registry/API/search use one source-owned catalog DTO subset and omit private owner/contact/admin fields.
- Discovery outputs are AE-hosted fallback only, route-tested, stale/suppression-aware, and explicit that callable/payment/MCP/OpenAPI/API-key/merchant-origin UCP are unavailable.
- Admin/dispute/operator recovery paths deny non-admins, enforce role/action authority, rate-limit public removal intake, audit denied/destructive actions, and expose repair/readback rows.
- Source-mining/import/copy/SEO/type/security gates are real and non-no-op; fixture gates still detect bad cases.
- Claims register covers route copy, SEO/AEO, API/discovery outputs, GTM assets, and optional product-marketing drafts.
- Owner activation state can be queried for publish, status readback, capability health, share/interest, attribution, and friction/failure.
- Fable 5 accepted findings map to implementation evidence or explicit residual risk.
- Internal-alpha readiness is not overclaimed when five-owner evidence is absent.
- `npm run check:convex-codegen` is recorded honestly as blocked; do not mark Phase 1 deploy-ready or launch-ready until real Clerk/Convex/deploy evidence exists.

**Suggested Spec prompt:**

```text
Review `git diff e4d73f9...HEAD` against the Phase 1 spec and Plan 01-08 closeout sources listed above. Report: (a) required behavior that is missing or partial; (b) behavior added that the spec did not ask for or explicitly excluded; (c) behavior that appears implemented but is wrong or under-evidenced. Quote the spec or plan line/source for each finding and cite the changed file/hunk. Do not discuss style or engineering standards unless the issue is also a spec mismatch. Keep this axis separate from Standards.
```

## Commit Range Snapshot

Use this snapshot as a sanity check; rerun `git log e4d73f9..HEAD --oneline` when the final 01-08 summary commit is present.

```text
8134856 chore(01-01): scaffold runtime substrate
d979133 test(01-01): add substrate guardrail scanners
1ab9c26 fix(01-01): fail closed on missing Clerk issuer
f93b6f3 docs(01-01): complete substrate and guardrails plan
b89171e feat(01-02): add module-owned contracts and schema
c60cc89 feat(01-02): implement observability contracts
4842032 feat(01-02): add admin authority and lifecycle descriptors
6ce1d33 docs(01-02): complete contracts schema idempotency admin foundation plan
a4785d4 feat(01-03): add source-owned business claim seam
9e4c20a feat(01-03): add duplicate claim controls
250b580 feat(01-03): enforce claim csrf and rate limits
b494eb2 feat(01-03): validate catalog first-request DTOs
2e73905 feat(01-03): publish catalog idempotently
f643e38 feat(01-03): suppress catalog visibility with invalidation intents
e794049 test(01-03): cover claim publish suppress flow
449465c docs(01-03): complete business claim publish suppress plan
7ccd956 feat(01-04): enforce source-owned admin membership changes
b3f7507 feat(01-04): add protected admin readback shells
b3f0126 feat(01-04): add removal dispute intake controls
c260a8e feat(01-04): add audited unsuppression flow
7637318 feat(01-04): add operator control readbacks
c527ead feat(01-04): enrich admin operational readback shells
cbf4f6c docs(01-04): complete admin dispute operator recovery plan
d536ff3 test(01-04): preserve phase-owned copy guardrails
8961e8c feat(01-05): add owner public readback and SEO seams
c7743b7 feat(01-05): ship public owner UI routes
fb98147 fix(01-05): make public skip target focusable
0152af2 test(01-05): add public owner browser coverage
8553bc7 docs(01-05): complete public owner UI routes plan
58693a8 feat(01-06): implement registry projection sync
5a1d064 test(01-06): cover registry projection repair retry
aa41a80 feat(01-06): expose registry public catalog APIs
ce0b999 feat(01-06): add registry search UI
4f351c3 feat(01-06): wire admin index health readback
4a1aebe fix(01-06): tighten registry API pagination and fields
5e08bfb docs(01-06): complete registry search api repair plan
779041a test(01-06): harden public copy overclaim guardrails
690247e feat(01-07): build discovery manifest from catalog DTO
35357b4 feat(01-07): add discovery manifest readback state
2e86997 feat(01-07): serve AE-hosted UCP manifests
cfb004b feat(01-07): generate llms sitemap and robots files
706f0bf test(01-07): cover discovery prompt injection guards
0e56f9b test(01-07): verify discovery route URL parity
6cc9625 fix(01-07): align generated discovery route tree
10624a8 docs(01-07): complete discovery llms sitemap robots plan
acf447b fix(01-08): harden local gate suite routes
2421f85 test(01-08): trace claims register surfaces
29753c3 test(01-08): map source-mining ledger seams
18440a2 feat(01-08): expose owner activation readbacks
c5cb373 docs(01-08): map Fable closeout evidence
```

## Aggregation Template

```markdown
## Standards

[Findings from Standards reviewer only.]

## Spec

[Findings from Spec reviewer only.]

## Counts

- Standards findings: N. Worst Standards issue: ...
- Spec findings: N. Worst Spec issue: ...
```

The final one-line summary may compare counts, but it must not select a single cross-axis winner.
